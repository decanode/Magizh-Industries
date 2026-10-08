const { db } = require('../config/firebase');
const { financialYearOf, todayIst, allocateDocumentNumber } = require('../utils/documentNumber');
const { priceLines } = require('../utils/salesOrderPricing');
const { SalesOrderError } = require('./SalesOrderService');

const HSN_PATTERN = /^\d{4,8}$/;
const roundQuantity = (value) => Math.round(value * 1000) / 1000;

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Tax invoices, one per delivery. An invoice can only be raised once the customer has confirmed the costing, and
// once issued it never changes: a wrong invoice is cancelled (its number stays used and is kept on record) and a
// new one is raised with the next number.
class InvoiceService {
  constructor() {
    this.invoices = db.collection('invoices');
    this.deliveries = db.collection('deliveries');
    this.orders = db.collection('sales_orders');
    this.materials = db.collection('Master_material');
    this.requests = db.collection('Request_tracking');
  }

  // Adds what depends on today's date: an unpaid invoice past its due date is overdue.
  static decorate(invoice) {
    const today = todayIst();
    const overdue = invoice.status === 'Issued' && invoice.dueDate < today;
    const daysOverdue = overdue ? Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${invoice.dueDate}T00:00:00Z`)) / 86400000) : 0;
    return { ...invoice, overdue, daysOverdue };
  }

  // --- create ------------------------------------------------------------------------------------------

  async createFromDelivery(deliveryId, input, actor, idempotencyKey) {
    if (!idempotencyKey) throw new SalesOrderError('VALIDATION', 'Missing idempotency key. Please refresh and try again.');

    const invoiceDate = input.invoiceDate || todayIst();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(new Date(invoiceDate).getTime())) {
      throw new SalesOrderError('VALIDATION', 'Enter a valid invoice date');
    }
    if (invoiceDate > todayIst()) throw new SalesOrderError('VALIDATION', 'The invoice date cannot be in the future');

    const termsInput = input.paymentTermsDays;
    if (termsInput !== undefined && termsInput !== '' && !(Number.isInteger(Number(termsInput)) && Number(termsInput) >= 0 && Number(termsInput) <= 120)) {
      throw new SalesOrderError('VALIDATION', 'Payment terms must be a whole number of days between 0 and 120');
    }

    const deliveryRef = this.deliveries.doc(deliveryId);
    const preview = await deliveryRef.get();
    if (!preview.exists) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');

    const invoiceRef = this.invoices.doc();
    const requestRef = this.requests.doc(`inv-${idempotencyKey}`);
    const financialYear = financialYearOf(invoiceDate);
    const materialRefs = [...new Set(preview.data().lines.map((line) => line.materialId))].map((id) => this.materials.doc(id));

    return db.runTransaction(async (transaction) => {
      // 1. All reads first
      const replay = await transaction.get(requestRef);
      if (replay.exists) return { ...replay.data().result, replayed: true };

      const deliverySnapshot = await transaction.get(deliveryRef);
      if (!deliverySnapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');
      const delivery = { id: deliveryId, ...deliverySnapshot.data() };

      const orderRef = this.orders.doc(delivery.salesOrderId);
      const orderSnapshot = await transaction.get(orderRef);
      const order = { id: orderRef.id, ...orderSnapshot.data() };

      const materialSnapshots = await Promise.all(materialRefs.map((ref) => transaction.get(ref)));
      const hsnByMaterial = Object.fromEntries(
        materialSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, String(snapshot.data().hsnCode || '').trim()])
      );

      const numbering = await allocateDocumentNumber(db, transaction, 'INV', financialYear);

      // 2. Hard stops
      if (delivery.status !== 'Created') throw new SalesOrderError('LOCKED', 'A cancelled delivery cannot be invoiced');
      if (delivery.invoiceId) {
        throw new SalesOrderError('ALREADY_INVOICED', `This delivery already has invoice ${delivery.invoiceNumber}`);
      }
      if (!delivery.costingConfirmed) {
        throw new SalesOrderError('COSTING_NOT_CONFIRMED', 'The customer has not confirmed the costing for this delivery yet');
      }

      // Each line's description and HSN/SAC default to the material's name and the HSN in the material master today
      // (not as it was when the order was taken). The person invoicing can override either - for example to bill
      // a job-work service under a SAC code while the delivery listed the parts.
      const overrides = Object.fromEntries((Array.isArray(input.lines) ? input.lines : []).map((entry) => [Number(entry.soLineNo), entry]));
      const resolved = delivery.lines.map((line) => {
        const override = overrides[line.soLineNo] || {};
        return {
          line,
          description: String(override.description || '').trim() || line.materialName,
          hsnCode: String(override.hsnCode || '').trim() || hsnByMaterial[line.materialId] || ''
        };
      });

      const missingHsn = resolved
        .filter(({ hsnCode }) => !HSN_PATTERN.test(hsnCode))
        .map(({ line }) => ({ materialCode: line.materialCode, materialName: line.materialName }));
      if (missingHsn.length) {
        throw new SalesOrderError('MISSING_HSN', 'Enter a valid HSN/SAC code (4 to 8 digits) for these items - in the Material Master, or on the invoice', missingHsn);
      }

      // 3. Price from the delivery's confirmed values and write everything
      const priced = priceLines(resolved.map(({ line, hsnCode }) => ({ ...line, hsnCode })), delivery.taxType);
      const lines = priced.lines.map((line, index) => ({
        ...line,
        soLineNo: delivery.lines[index].soLineNo,
        description: resolved[index].description
      }));

      const paymentTermsDays = termsInput === undefined || termsInput === '' ? delivery.paymentTermsDays : Number(termsInput);
      const now = new Date().toISOString();
      const by = actor.email || 'system';

      const invoice = {
        id: invoiceRef.id,
        invoiceNumber: numbering.documentNumber,
        financialYear,
        invoiceDate,
        paymentTermsDays,
        dueDate: addDays(invoiceDate, paymentTermsDays),
        status: 'Issued',
        deliveryId: delivery.id,
        dcNumber: delivery.dcNumber,
        deliveryDate: delivery.deliveryDate,
        salesOrderId: delivery.salesOrderId,
        soNumber: delivery.soNumber,
        customerPoNumber: delivery.customerPoNumber,
        customerId: delivery.customerId,
        customer: delivery.customer,
        billTo: delivery.billTo,
        shipTo: delivery.shipTo,
        taxType: delivery.taxType,
        vehicleNumber: delivery.vehicleNumber,
        transporter: delivery.transporter,
        ewayBillNumber: delivery.ewayBillNumber,
        costingReference: delivery.costingReference,
        quotationNumber: delivery.quotationNumber || '',
        lines,
        totals: priced.totals,
        paidAt: null,
        emailedAt: null,
        version: 1,
        history: [{ at: now, by, action: 'Issued' }],
        createdAt: now,
        createdBy: by,
        updatedAt: now,
        updatedBy: by
      };

      const orderLines = order.lines.map((line) => {
        const invoiced = lines.find((entry) => entry.soLineNo === line.lineNo);
        return invoiced ? { ...line, invoicedQty: roundQuantity((line.invoicedQty || 0) + invoiced.quantity) } : line;
      });

      numbering.commit();
      transaction.set(invoiceRef, invoice);
      transaction.set(deliveryRef, {
        ...delivery,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        version: delivery.version + 1,
        history: [...delivery.history, { at: now, by, action: `Invoice ${invoice.invoiceNumber} issued` }],
        updatedAt: now,
        updatedBy: by
      });
      transaction.set(orderRef, {
        ...order,
        lines: orderLines,
        version: order.version + 1,
        history: [...order.history, { at: now, by, action: `Invoice ${invoice.invoiceNumber} issued for ${delivery.dcNumber}` }],
        updatedAt: now,
        updatedBy: by
      });
      transaction.set(requestRef, { result: invoice, timestamp: now });

      return invoice;
    });
  }

  // --- read --------------------------------------------------------------------------------------------

  async getById(id) {
    const snapshot = await this.invoices.doc(id).get();
    return snapshot.exists ? InvoiceService.decorate({ id: snapshot.id, ...snapshot.data() }) : null;
  }

  async list({ search = '', status = 'all' } = {}) {
    const snapshot = await this.invoices.get();
    const term = search.trim().toLowerCase();

    return snapshot.docs
      .map((doc) => InvoiceService.decorate({ id: doc.id, ...doc.data() }))
      .filter((invoice) => {
        if (status === 'all') return true;
        if (status === 'Overdue') return invoice.overdue;
        return invoice.status === status;
      })
      .filter((invoice) =>
        !term || [invoice.invoiceNumber, invoice.dcNumber, invoice.soNumber, invoice.customer?.name, invoice.customer?.code, invoice.customerPoNumber]
          .some((value) => String(value || '').toLowerCase().includes(term))
      )
      .map(({ lines, history, ...summary }) => ({ ...summary, lineCount: lines.length }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  // --- cancel ------------------------------------------------------------------------------------------

  // The invoice stays on record as Cancelled and its number is never reused. The delivery is released so a corrected
  // invoice can be raised.
  async cancel(id, reason, actor) {
    if (!String(reason || '').trim()) throw new SalesOrderError('VALIDATION', 'A cancellation reason is required');
    const invoiceRef = this.invoices.doc(id);

    return db.runTransaction(async (transaction) => {
      const invoiceSnapshot = await transaction.get(invoiceRef);
      if (!invoiceSnapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Invoice not found');
      const invoice = { id, ...invoiceSnapshot.data() };

      if (invoice.status === 'Cancelled') throw new SalesOrderError('LOCKED', 'This invoice is already cancelled');
      if (invoice.status !== 'Issued') throw new SalesOrderError('LOCKED', 'A paid invoice cannot be cancelled');

      const deliveryRef = this.deliveries.doc(invoice.deliveryId);
      const orderRef = this.orders.doc(invoice.salesOrderId);
      const [deliverySnapshot, orderSnapshot] = await Promise.all([transaction.get(deliveryRef), transaction.get(orderRef)]);
      const delivery = { id: deliveryRef.id, ...deliverySnapshot.data() };
      const order = { id: orderRef.id, ...orderSnapshot.data() };

      const now = new Date().toISOString();
      const by = actor.email || 'system';

      const orderLines = order.lines.map((line) => {
        const invoiced = invoice.lines.find((entry) => entry.soLineNo === line.lineNo);
        return invoiced ? { ...line, invoicedQty: roundQuantity(Math.max(0, (line.invoicedQty || 0) - invoiced.quantity)) } : line;
      });

      transaction.set(invoiceRef, {
        ...invoice,
        status: 'Cancelled',
        cancelReason: reason.trim(),
        cancelledAt: now,
        version: invoice.version + 1,
        history: [...invoice.history, { at: now, by, action: 'Cancelled', note: reason.trim() }],
        updatedAt: now,
        updatedBy: by
      });
      transaction.set(deliveryRef, {
        ...delivery,
        invoiceId: null,
        invoiceNumber: null,
        version: delivery.version + 1,
        history: [...delivery.history, { at: now, by, action: `Invoice ${invoice.invoiceNumber} cancelled`, note: reason.trim() }],
        updatedAt: now,
        updatedBy: by
      });
      transaction.set(orderRef, {
        ...order,
        lines: orderLines,
        version: order.version + 1,
        history: [...order.history, { at: now, by, action: `Invoice ${invoice.invoiceNumber} cancelled`, note: reason.trim() }],
        updatedAt: now,
        updatedBy: by
      });

      return { ...invoice, status: 'Cancelled', cancelReason: reason.trim() };
    });
  }
}

module.exports = InvoiceService;
