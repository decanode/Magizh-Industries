const { db } = require('../config/firebase');
const { financialYearOf, todayIst, allocateDocumentNumber } = require('../utils/documentNumber');
const { priceLines } = require('../utils/salesOrderPricing');
const { deriveOrderStatus } = require('../utils/orderStatus');
const { SalesOrderError, customerAddressFields } = require('./SalesOrderService');

const QUANTITY_EPSILON = 1e-9;
const roundQuantity = (value) => Math.round(value * 1000) / 1000;

// Deliveries (delivery challans). One order can have many; each ships part of the order to one ship-to address and
// later gets its own invoice. Stock is NOT touched here - it was taken when the order was created.
class DeliveryService {
  constructor() {
    this.deliveries = db.collection('deliveries');
    this.orders = db.collection('sales_orders');
    this.customers = db.collection('customers');
    this.requests = db.collection('Request_tracking');
  }

  // --- input helpers -----------------------------------------------------------------------------------

  async resolveShipTo(customerId, shipToId) {
    const snapshot = await this.customers.doc(String(customerId)).get();
    if (!snapshot.exists) {
      const archived = await db.collection('customers_archive').doc(String(customerId)).get();
      if (archived.exists) {
        throw new SalesOrderError('LOCKED', 'This customer has been archived. Restore the customer before creating or changing its deliveries.');
      }
    }
    const addresses = snapshot.exists && Array.isArray(snapshot.data().addresses) ? snapshot.data().addresses : [];
    const address = addresses.find((entry) => entry.id === shipToId && entry.type === 'shipping');
    if (!address) throw new SalesOrderError('VALIDATION', 'Select a ship-to address for this delivery');
    return customerAddressFields(address);
  }

  static transportFields(input) {
    const text = (value) => String(value || '').trim();
    return {
      deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate || '') ? input.deliveryDate : todayIst(),
      vehicleNumber: text(input.vehicleNumber).toUpperCase(),
      transporter: text(input.transporter),
      ewayBillNumber: text(input.ewayBillNumber),
      notes: text(input.notes)
    };
  }

  static parsePrice(value, label) {
    const price = Number(value);
    if (!(price >= 0) || Math.round(price * 100) / 100 !== price) {
      throw new SalesOrderError('VALIDATION', `${label}: price must be a valid amount`);
    }
    return price;
  }

  // --- create ------------------------------------------------------------------------------------------

  async create(orderId, input, actor, idempotencyKey) {
    if (!idempotencyKey) throw new SalesOrderError('VALIDATION', 'Missing idempotency key. Please refresh and try again.');
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new SalesOrderError('VALIDATION', 'Choose at least one item to deliver');
    }

    const seen = new Set();
    const requested = input.lines.map((line, index) => {
      const lineNo = Number(line.lineNo);
      const quantity = Number(line.quantity);
      if (seen.has(lineNo)) throw new SalesOrderError('VALIDATION', `Order line ${lineNo} appears twice`);
      seen.add(lineNo);
      if (!(quantity > 0) || roundQuantity(quantity) !== quantity) {
        throw new SalesOrderError('VALIDATION', `Line ${index + 1}: quantity must be greater than 0 (up to 3 decimals)`);
      }
      return { lineNo, quantity, unitPrice: line.unitPrice };
    });

    const orderRef = this.orders.doc(orderId);
    const preview = await orderRef.get();
    if (!preview.exists) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');
    const shipTo = await this.resolveShipTo(preview.data().customerId, input.shipToId || preview.data().shipTo.id);

    const deliveryRef = this.deliveries.doc();
    const requestRef = this.requests.doc(`dc-${idempotencyKey}`);
    const financialYear = financialYearOf();

    return db.runTransaction(async (transaction) => {
      // 1. All reads first
      const replay = await transaction.get(requestRef);
      if (replay.exists) return { ...replay.data().result, replayed: true };

      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');
      const order = { id: orderId, ...orderSnapshot.data() };
      if (!['Open', 'In Delivery'].includes(order.status)) {
        throw new SalesOrderError('LOCKED', `A ${order.status.toLowerCase()} order has nothing left to deliver`);
      }

      const numbering = await allocateDocumentNumber(db, transaction, 'DC', financialYear);

      // 2. Check every line against what is still undelivered
      const problems = [];
      const priceInput = requested.map((line) => {
        const orderLine = order.lines.find((entry) => entry.lineNo === line.lineNo);
        if (!orderLine) throw new SalesOrderError('VALIDATION', `Order line ${line.lineNo} does not exist`);

        const remaining = roundQuantity(orderLine.quantity - (orderLine.deliveredQty || 0));
        if (line.quantity > remaining + QUANTITY_EPSILON) {
          problems.push({ lineNo: line.lineNo, materialName: orderLine.materialName, requested: line.quantity, remaining });
        }

        return {
          ...orderLine,
          soLineNo: orderLine.lineNo,
          quantity: line.quantity,
          unitPrice: line.unitPrice === undefined || line.unitPrice === '' ? orderLine.unitPrice : DeliveryService.parsePrice(line.unitPrice, orderLine.materialName)
        };
      });
      if (problems.length) throw new SalesOrderError('OVER_DELIVERY', 'More than the undelivered quantity was requested', problems);

      const priced = priceLines(priceInput, order.taxType);
      const lines = priced.lines.map((line, index) => ({ ...line, soLineNo: priceInput[index].soLineNo, lineNo: index + 1 }));

      // 3. Then all writes
      const now = new Date().toISOString();
      const delivery = {
        id: deliveryRef.id,
        dcNumber: numbering.documentNumber,
        financialYear,
        salesOrderId: order.id,
        soNumber: order.soNumber,
        customerId: order.customerId,
        customer: order.customer,
        billTo: order.billTo,
        shipTo,
        taxType: order.taxType,
        paymentTermsDays: order.paymentTermsDays,
        customerPoNumber: order.customerPoNumber,
        quotationNumber: order.quotationNumber || '',
        ...DeliveryService.transportFields(input),
        lines,
        totals: priced.totals,
        status: 'Created',
        costingConfirmed: false,
        costingReference: '',
        costingConfirmedAt: null,
        costingConfirmedBy: null,
        invoiceId: null,
        version: 1,
        history: [{ at: now, by: actor.email || 'system', action: 'Created' }],
        createdAt: now,
        createdBy: actor.email || 'system',
        updatedAt: now,
        updatedBy: actor.email || 'system'
      };

      const orderLines = order.lines.map((line) => {
        const delivered = lines.find((entry) => entry.soLineNo === line.lineNo);
        return delivered ? { ...line, deliveredQty: roundQuantity((line.deliveredQty || 0) + delivered.quantity) } : line;
      });

      numbering.commit();
      transaction.set(deliveryRef, delivery);
      transaction.set(orderRef, {
        ...order,
        lines: orderLines,
        status: deriveOrderStatus(orderLines),
        version: order.version + 1,
        history: [...order.history, { at: now, by: actor.email || 'system', action: `Delivery ${delivery.dcNumber} created` }],
        updatedAt: now,
        updatedBy: actor.email || 'system'
      });
      transaction.set(requestRef, { result: delivery, timestamp: now });

      return delivery;
    });
  }

  // --- read --------------------------------------------------------------------------------------------

  async getById(id) {
    const snapshot = await this.deliveries.doc(id).get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  }

  async list({ search = '', status = 'all', salesOrderId = '' } = {}) {
    const snapshot = await this.deliveries.get();
    const term = search.trim().toLowerCase();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((delivery) => !salesOrderId || delivery.salesOrderId === salesOrderId)
      .filter((delivery) => {
        if (status === 'all') return true;
        if (status === 'CostingPending') return delivery.status === 'Created' && !delivery.costingConfirmed;
        // Confirmed and waiting to be invoiced
        if (status === 'CostingConfirmed') return delivery.status === 'Created' && delivery.costingConfirmed && !delivery.invoiceId;
        if (status === 'Invoiced') return delivery.status === 'Created' && Boolean(delivery.invoiceId);
        return delivery.status === status;
      })
      .filter((delivery) =>
        !term || [delivery.dcNumber, delivery.soNumber, delivery.customer?.name, delivery.customer?.code, delivery.vehicleNumber]
          .some((value) => String(value || '').toLowerCase().includes(term))
      )
      .map(({ lines, history, ...summary }) => ({ ...summary, lineCount: lines.length }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  // The HSN in the material master today, for printing (the challan shows it, but it is not required to deliver)
  async currentHsnByMaterial(delivery) {
    const ids = [...new Set(delivery.lines.map((line) => line.materialId))];
    const snapshots = await Promise.all(ids.map((id) => db.collection('Master_material').doc(id).get()));
    return Object.fromEntries(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data().hsnCode || '']));
  }

  // --- change ------------------------------------------------------------------------------------------

  // Quantities never change on a delivery (cancel and re-create instead). What can change is where it goes, the
  // transport details, notes and - until the customer confirms the costing - the prices.
  async update(id, input, actor) {
    const existing = await this.getById(id);
    if (!existing) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');

    const shipTo = input.shipToId && input.shipToId !== existing.shipTo.id
      ? await this.resolveShipTo(existing.customerId, input.shipToId)
      : existing.shipTo;
    const deliveryRef = this.deliveries.doc(id);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(deliveryRef);
      if (!snapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');
      const current = { id, ...snapshot.data() };

      if (current.status !== 'Created') throw new SalesOrderError('LOCKED', 'A cancelled delivery cannot be changed');
      if (current.invoiceId) throw new SalesOrderError('LOCKED', 'This delivery has been invoiced and can no longer be changed');
      if (Number(input.version) !== current.version) {
        throw new SalesOrderError('CONFLICT', 'This delivery was changed by someone else. Reload it and try again.');
      }

      let { lines, totals } = current;
      const priceChanges = Array.isArray(input.lines) ? input.lines : [];
      const repriced = current.lines.map((line) => {
        const change = priceChanges.find((entry) => Number(entry.soLineNo) === line.soLineNo);
        if (!change || change.unitPrice === undefined || change.unitPrice === '') return line;
        const unitPrice = DeliveryService.parsePrice(change.unitPrice, line.materialName);
        return unitPrice === line.unitPrice ? line : { ...line, unitPrice };
      });

      const pricesChanged = repriced.some((line, index) => line.unitPrice !== current.lines[index].unitPrice);
      if (pricesChanged) {
        if (current.costingConfirmed) {
          throw new SalesOrderError('LOCKED', 'The customer has confirmed this costing. Remove the confirmation before changing prices.');
        }
        const priced = priceLines(repriced, current.taxType);
        lines = priced.lines.map((line, index) => ({ ...line, soLineNo: repriced[index].soLineNo }));
        totals = priced.totals;
      }

      const now = new Date().toISOString();
      const updated = {
        ...current,
        ...DeliveryService.transportFields({ ...current, ...input }),
        shipTo,
        lines,
        totals,
        version: current.version + 1,
        history: [...current.history, { at: now, by: actor.email || 'system', action: 'Changed' }],
        updatedAt: now,
        updatedBy: actor.email || 'system'
      };
      transaction.set(deliveryRef, updated);
      return updated;
    });
  }

  // The customer's approval of the final costing. An invoice can only be created once this is set.
  async setCostingConfirmation(id, confirmed, reference, actor) {
    const deliveryRef = this.deliveries.doc(id);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(deliveryRef);
      if (!snapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');
      const current = { id, ...snapshot.data() };

      if (current.status !== 'Created') throw new SalesOrderError('LOCKED', 'A cancelled delivery cannot be changed');
      if (current.invoiceId) throw new SalesOrderError('LOCKED', 'This delivery has been invoiced, so the confirmation can no longer change');

      const now = new Date().toISOString();
      const by = actor.email || 'system';
      const updated = {
        ...current,
        costingConfirmed: Boolean(confirmed),
        costingReference: confirmed ? String(reference || '').trim() : '',
        costingConfirmedAt: confirmed ? now : null,
        costingConfirmedBy: confirmed ? by : null,
        version: current.version + 1,
        history: [...current.history, {
          at: now, by, action: confirmed ? 'Costing confirmed by customer' : 'Costing confirmation removed',
          ...(confirmed && String(reference || '').trim() ? { note: String(reference).trim() } : {})
        }],
        updatedAt: now,
        updatedBy: by
      };
      transaction.set(deliveryRef, updated);
      return updated;
    });
  }

  // Cancelling gives the quantity back to the order so it can be delivered again. Stock is unaffected.
  async cancel(id, reason, actor) {
    if (!String(reason || '').trim()) throw new SalesOrderError('VALIDATION', 'A cancellation reason is required');
    const deliveryRef = this.deliveries.doc(id);

    return db.runTransaction(async (transaction) => {
      const deliverySnapshot = await transaction.get(deliveryRef);
      if (!deliverySnapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Delivery not found');
      const delivery = { id, ...deliverySnapshot.data() };

      if (delivery.status !== 'Created') throw new SalesOrderError('LOCKED', 'This delivery is already cancelled');
      if (delivery.invoiceId) throw new SalesOrderError('LOCKED', 'This delivery has been invoiced and cannot be cancelled');
      if (delivery.costingConfirmed) {
        throw new SalesOrderError('LOCKED', 'The customer has confirmed this costing. Remove the confirmation before cancelling.');
      }

      const orderRef = this.orders.doc(delivery.salesOrderId);
      const orderSnapshot = await transaction.get(orderRef);
      const order = { id: orderRef.id, ...orderSnapshot.data() };

      const now = new Date().toISOString();
      const by = actor.email || 'system';

      const orderLines = order.lines.map((line) => {
        const shipped = delivery.lines.find((entry) => entry.soLineNo === line.lineNo);
        return shipped ? { ...line, deliveredQty: roundQuantity(Math.max(0, (line.deliveredQty || 0) - shipped.quantity)) } : line;
      });

      transaction.set(deliveryRef, {
        ...delivery,
        status: 'Cancelled',
        cancelReason: reason.trim(),
        cancelledAt: now,
        version: delivery.version + 1,
        history: [...delivery.history, { at: now, by, action: 'Cancelled', note: reason.trim() }],
        updatedAt: now,
        updatedBy: by
      });
      transaction.set(orderRef, {
        ...order,
        lines: orderLines,
        status: order.status === 'Cancelled' ? order.status : deriveOrderStatus(orderLines),
        version: order.version + 1,
        history: [...order.history, { at: now, by, action: `Delivery ${delivery.dcNumber} cancelled`, note: reason.trim() }],
        updatedAt: now,
        updatedBy: by
      });

      return { ...delivery, status: 'Cancelled', cancelReason: reason.trim() };
    });
  }
}

module.exports = DeliveryService;
