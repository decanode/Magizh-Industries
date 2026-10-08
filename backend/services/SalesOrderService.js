const crypto = require('crypto');
const { db } = require('../config/firebase');
const { financialYearOf, todayIst, allocateDocumentNumber } = require('../utils/documentNumber');
const { priceOrder, priceLines, taxTypeForState } = require('../utils/salesOrderPricing');
const { deriveOrderStatus } = require('../utils/orderStatus');

// Only finished goods are sold. Change here if raw material or scrap ever needs to be sold too.
const SELLABLE_FLOW = 'FIN';
const REF_TYPE = 'SalesOrder';
const QUANTITY_EPSILON = 1e-9;

class SalesOrderError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// `name` and `gstin` are the consignee's own when it differs from the customer (blank means the customer's)
const customerAddressFields = ({ id, type, label, name, gstin, line1, line2, city, state, pincode }) => ({
  id, type, label: label || '', name: name || '', gstin: gstin || '', line1, line2: line2 || '', city: city || '', state, pincode: pincode || ''
});

// Sales orders and their stock movements. Stock is NOT kept in a separate table: creating or changing an order
// posts Debit/Credit rows straight into the existing Stock_Entry ledger, in the same Firestore transaction that
// checks availability. Because that transaction reads the material's balance and writes the debit atomically,
// two orders placed at the same moment can never both take the last units.
class SalesOrderService {
  constructor() {
    this.orders = db.collection('sales_orders');
    this.ledger = db.collection('Stock_Entry');
    this.materials = db.collection('Master_material');
    this.customers = db.collection('customers');
    this.requests = db.collection('Request_tracking');
  }

  // --- stock -------------------------------------------------------------------------------------------

  static sumLedger(snapshot) {
    let balance = 0;
    snapshot.forEach((doc) => {
      const { entryType, quantity } = doc.data();
      const amount = parseFloat(quantity) || 0;
      if (entryType === 'Credit') balance += amount;
      else if (entryType === 'Debit') balance -= amount;
    });
    return balance;
  }

  // Balance of one material, read inside a transaction so the result is guaranteed to still hold at commit.
  async balanceIn(transaction, materialCode) {
    return SalesOrderService.sumLedger(await transaction.get(this.ledger.where('materialCode', '==', materialCode)));
  }

  ledgerRow({ line, entryType, quantity, order, actor, note }) {
    const now = new Date().toISOString();
    return {
      materialCode: line.materialCode,
      materialName: line.materialName,
      supplierCode: '',
      materialFlow: SELLABLE_FLOW,
      quantity,
      unit: line.unit,
      entryType,
      createdBy: actor.email || 'system',
      userFirstName: actor.firstName || 'Unknown',
      createdAt: now,
      refType: REF_TYPE,
      refId: order.id,
      refNumber: order.soNumber,
      refNote: note
    };
  }

  // Active finished goods with their current available stock, for the order page's material picker.
  async listSellableMaterials() {
    const [materialSnapshot, ledgerSnapshot] = await Promise.all([
      this.materials.where('materialFlow', '==', SELLABLE_FLOW).get(),
      this.ledger.get()
    ]);

    const balances = {};
    ledgerSnapshot.forEach((doc) => {
      const { materialCode, entryType, quantity } = doc.data();
      const amount = parseFloat(quantity) || 0;
      balances[materialCode] = (balances[materialCode] || 0) + (entryType === 'Credit' ? amount : entryType === 'Debit' ? -amount : 0);
    });

    return materialSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((material) => material.status !== 'archived')
      .map((material) => ({
        id: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        catNo: material.catNo || '',
        hsnCode: material.hsnCode || '',
        unit: material.unit || 'EA',
        unitPrice: parseFloat(material.costPerItem) || 0,
        cgst: material.cgst || '',
        sgst: material.sgst || '',
        igst: material.igst || '',
        available: Math.max(0, Math.round((balances[material.materialCode] || 0) * 1000) / 1000)
      }))
      .sort((a, b) => String(a.materialCode).localeCompare(String(b.materialCode), undefined, { numeric: true }));
  }

  // --- input resolution --------------------------------------------------------------------------------

  async resolveCustomer(input) {
    const snapshot = await this.customers.doc(String(input.customerId || 'missing')).get();
    if (!snapshot.exists) {
      const archived = await db.collection('customers_archive').doc(String(input.customerId || 'missing')).get();
      if (archived.exists) {
        throw new SalesOrderError('LOCKED', 'This customer has been archived. Restore the customer before creating or changing its orders.');
      }
      throw new SalesOrderError('VALIDATION', 'Select a customer');
    }
    const customer = { id: snapshot.id, ...snapshot.data() };

    const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
    const pick = (id, type, label) => {
      const address = addresses.find((entry) => entry.id === id && entry.type === type);
      if (!address) throw new SalesOrderError('VALIDATION', `Select a ${label} address for this customer`);
      return customerAddressFields(address);
    };

    return {
      customer,
      billTo: pick(input.billToId, 'billing', 'bill-to'),
      shipTo: pick(input.shipToId, 'shipping', 'ship-to')
    };
  }

  async resolveLines(inputLines) {
    if (!Array.isArray(inputLines) || inputLines.length === 0) {
      throw new SalesOrderError('VALIDATION', 'Add at least one material');
    }

    const seen = new Set();
    const lines = [];
    for (const [index, input] of inputLines.entries()) {
      const quantity = Number(input.quantity);
      const unitPrice = Number(input.unitPrice);
      if (!(quantity > 0) || Math.round(quantity * 1000) / 1000 !== quantity) {
        throw new SalesOrderError('VALIDATION', `Line ${index + 1}: quantity must be greater than 0 (up to 3 decimals)`);
      }
      if (!(unitPrice >= 0) || Math.round(unitPrice * 100) / 100 !== unitPrice) {
        throw new SalesOrderError('VALIDATION', `Line ${index + 1}: price must be a valid amount`);
      }

      const snapshot = await this.materials.doc(String(input.materialId || 'missing')).get();
      if (!snapshot.exists) throw new SalesOrderError('VALIDATION', `Line ${index + 1}: select a material`);
      const material = { id: snapshot.id, ...snapshot.data() };

      if (material.materialFlow !== SELLABLE_FLOW) {
        throw new SalesOrderError('VALIDATION', `${material.materialName} is not a finished good and cannot be sold`);
      }
      if (seen.has(material.id)) {
        throw new SalesOrderError('VALIDATION', `${material.materialName} is added twice - combine it into one line`);
      }
      seen.add(material.id);

      lines.push({ material, quantity, unitPrice });
    }
    return lines;
  }

  buildOrderBody(input, { customer, billTo, shipTo }, resolvedLines) {
    const taxType = ['INTRA', 'INTER'].includes(input.taxType) ? input.taxType : taxTypeForState(billTo.state);

    for (const { material } of resolvedLines) {
      const hasRate = (parseFloat(material.igst) || 0) + (parseFloat(material.cgst) || 0) + (parseFloat(material.sgst) || 0) > 0;
      if (!hasRate) {
        throw new SalesOrderError('VALIDATION', `${material.materialName} has no GST rate in the material master`);
      }
    }

    const { lines, totals } = priceOrder(resolvedLines, taxType);
    const paymentTermsDays = Number.isInteger(Number(input.paymentTermsDays))
      ? Number(input.paymentTermsDays)
      : Number(customer.paymentTermsDays) || 45;

    return {
      customerId: customer.id,
      customer: {
        code: customer.code,
        name: customer.name,
        gstin: customer.gstin || '',
        email: customer.email || '',
        phone: customer.phone || ''
      },
      billTo,
      shipTo,
      taxType,
      orderDate: /^\d{4}-\d{2}-\d{2}$/.test(input.orderDate || '') ? input.orderDate : todayIst(),
      customerPoNumber: String(input.customerPoNumber || '').trim(),
      customerPoDate: input.customerPoDate || '',
      // Printed on the invoice as "HALB  <number>": the customer's quotation number
      quotationNumber: String(input.quotationNumber || '').trim().slice(0, 50),
      expectedDeliveryDate: input.expectedDeliveryDate || '',
      paymentTermsDays,
      notes: String(input.notes || '').trim(),
      lines,
      totals
    };
  }

  // --- create ------------------------------------------------------------------------------------------

  async create(input, actor, idempotencyKey) {
    if (!idempotencyKey) throw new SalesOrderError('VALIDATION', 'Missing idempotency key. Please refresh and try again.');

    const parties = await this.resolveCustomer(input);
    const resolvedLines = await this.resolveLines(input.lines);
    const body = this.buildOrderBody(input, parties, resolvedLines);

    const orderRef = this.orders.doc();
    const requestRef = this.requests.doc(`so-${idempotencyKey}`);
    const financialYear = financialYearOf();

    return db.runTransaction(async (transaction) => {
      // 1. All reads first
      const replay = await transaction.get(requestRef);
      if (replay.exists) return { ...replay.data().result, replayed: true };

      const numbering = await allocateDocumentNumber(db, transaction, 'SO', financialYear);

      const shortages = [];
      for (const line of body.lines) {
        const available = await this.balanceIn(transaction, line.materialCode);
        if (line.quantity > available + QUANTITY_EPSILON) {
          shortages.push({
            materialCode: line.materialCode,
            materialName: line.materialName,
            requested: line.quantity,
            available: Math.max(0, Math.round(available * 1000) / 1000)
          });
        }
      }
      // Hard stop: nothing is written if any line is short
      if (shortages.length) {
        throw new SalesOrderError('INSUFFICIENT_STOCK', 'Not enough stock for this order', shortages);
      }

      // 2. Then all writes
      const now = new Date().toISOString();
      const order = {
        ...body,
        id: orderRef.id,
        soNumber: numbering.documentNumber,
        financialYear,
        status: 'Open',
        version: 1,
        history: [{ at: now, by: actor.email || 'system', action: 'Created' }],
        createdAt: now,
        createdBy: actor.email || 'system',
        updatedAt: now,
        updatedBy: actor.email || 'system'
      };
      order.lines = order.lines.map((line) => ({ ...line, deliveredQty: 0, invoicedQty: 0 }));

      numbering.commit();
      transaction.set(orderRef, order);
      order.lines.forEach((line) => {
        transaction.set(this.ledger.doc(), this.ledgerRow({ line, entryType: 'Debit', quantity: line.quantity, order, actor, note: 'Sales order created' }));
      });
      transaction.set(requestRef, { result: order, timestamp: now });

      return order;
    });
  }

  // --- read --------------------------------------------------------------------------------------------

  async getById(id) {
    const snapshot = await this.orders.doc(id).get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  }

  async list({ search = '', status = 'all' } = {}) {
    const snapshot = await this.orders.get();
    const term = search.trim().toLowerCase();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((order) => status === 'all' || order.status === status)
      .filter((order) =>
        !term || [order.soNumber, order.customer?.name, order.customer?.code, order.customerPoNumber, order.quotationNumber]
          .some((value) => String(value || '').toLowerCase().includes(term))
      )
      .map(({ lines, history, ...summary }) => ({ ...summary, lineCount: lines.length }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  // --- change ------------------------------------------------------------------------------------------

  // Before the first delivery everything can change (stock is adjusted by the difference). Once goods have been
  // delivered only prices, dates and notes can change. The customer itself can never change - cancel and re-create.
  async update(id, input, actor) {
    const existing = await this.getById(id);
    if (!existing) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');

    const delivered = existing.lines.some((line) => line.deliveredQty > 0);
    const resolvedLines = await this.resolveLines(input.lines);

    if (delivered) {
      // Quantities and materials are frozen; only the price of existing lines can move
      const sameShape =
        resolvedLines.length === existing.lines.length &&
        resolvedLines.every(({ material, quantity }) => {
          const old = existing.lines.find((line) => line.materialId === material.id);
          return old && old.quantity === quantity;
        });
      if (!sameShape) {
        throw new SalesOrderError('LOCKED', 'Goods have already been delivered, so only prices, dates and notes can change');
      }
    }

    const parties = await this.resolveCustomer({
      customerId: existing.customerId,
      billToId: input.billToId,
      shipToId: input.shipToId
    });
    const body = this.buildOrderBody(input, parties, resolvedLines);
    const orderRef = this.orders.doc(id);

    // Keep each line's number stable: deliveries refer to it. A line added later gets the next free number.
    const numberByMaterial = Object.fromEntries(existing.lines.map((line) => [line.materialId, line.lineNo]));
    let nextLineNo = Math.max(0, ...existing.lines.map((line) => line.lineNo)) + 1;
    body.lines = body.lines.map((line) => ({ ...line, lineNo: numberByMaterial[line.materialId] ?? nextLineNo++ }));

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');
      const current = { id, ...snapshot.data() };

      if (current.status === 'Cancelled') throw new SalesOrderError('LOCKED', 'A cancelled order cannot be changed');
      const priceLocked = body.lines.find((line) => {
        const old = current.lines.find((entry) => entry.materialId === line.materialId);
        return old && old.invoicedQty > 0 && old.unitPrice !== line.unitPrice;
      });
      if (priceLocked) {
        throw new SalesOrderError('LOCKED', `${priceLocked.materialName} has been invoiced, so its price can no longer change`);
      }
      if (current.lines.some((line) => line.deliveredQty > 0) && (body.billTo.id !== current.billTo.id || body.taxType !== current.taxType)) {
        throw new SalesOrderError('LOCKED', 'Goods have already been delivered, so the bill-to address and GST type can no longer change');
      }
      if (Number(input.version) !== current.version) {
        throw new SalesOrderError('CONFLICT', 'This order was changed by someone else. Reload it and try again.');
      }

      // Net change per material: positive = take more stock, negative = give stock back
      const oldQty = Object.fromEntries(current.lines.map((line) => [line.materialCode, line.quantity]));
      const newQty = Object.fromEntries(body.lines.map((line) => [line.materialCode, line.quantity]));
      const codes = [...new Set([...Object.keys(oldQty), ...Object.keys(newQty)])];

      const adjustments = [];
      const shortages = [];
      for (const code of codes) {
        const delta = Math.round(((newQty[code] || 0) - (oldQty[code] || 0)) * 1000) / 1000;
        if (delta === 0) continue;
        const line = body.lines.find((entry) => entry.materialCode === code) || current.lines.find((entry) => entry.materialCode === code);

        if (delta > 0) {
          const available = await this.balanceIn(transaction, code);
          if (delta > available + QUANTITY_EPSILON) {
            shortages.push({ materialCode: code, materialName: line.materialName, requested: delta, available: Math.max(0, Math.round(available * 1000) / 1000) });
          }
        }
        adjustments.push({ line, delta });
      }
      if (shortages.length) throw new SalesOrderError('INSUFFICIENT_STOCK', 'Not enough stock for the increased quantities', shortages);

      const now = new Date().toISOString();
      const mergedLines = body.lines.map((line) => {
        const old = current.lines.find((entry) => entry.materialId === line.materialId);
        return { ...line, deliveredQty: old?.deliveredQty || 0, invoicedQty: old?.invoicedQty || 0 };
      });
      const updated = {
        ...current,
        ...body,
        lines: mergedLines,
        status: deriveOrderStatus(mergedLines),
        version: current.version + 1,
        history: [...current.history, { at: now, by: actor.email || 'system', action: 'Changed' }],
        updatedAt: now,
        updatedBy: actor.email || 'system'
      };

      transaction.set(orderRef, updated);
      adjustments.forEach(({ line, delta }) => {
        transaction.set(this.ledger.doc(), this.ledgerRow({
          line,
          entryType: delta > 0 ? 'Debit' : 'Credit',
          quantity: Math.abs(delta),
          order: current,
          actor,
          note: 'Sales order changed'
        }));
      });

      return updated;
    });
  }

  // Cancelling gives every undelivered unit back to stock with reversing Credit rows. Nothing is ever deleted.
  async cancel(id, reason, actor) {
    if (!String(reason || '').trim()) throw new SalesOrderError('VALIDATION', 'A cancellation reason is required');
    const orderRef = this.orders.doc(id);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');
      const order = { id, ...snapshot.data() };

      if (order.status === 'Cancelled') throw new SalesOrderError('LOCKED', 'This order is already cancelled');
      if (order.lines.some((line) => line.deliveredQty > 0)) {
        throw new SalesOrderError('LOCKED', 'Goods have already been delivered. Cancel the deliveries first, or close the undelivered balance instead.');
      }

      const now = new Date().toISOString();
      const cancelled = {
        ...order,
        status: 'Cancelled',
        cancelReason: reason.trim(),
        cancelledAt: now,
        version: order.version + 1,
        history: [...order.history, { at: now, by: actor.email || 'system', action: 'Cancelled', note: reason.trim() }],
        updatedAt: now,
        updatedBy: actor.email || 'system'
      };

      transaction.set(orderRef, cancelled);
      order.lines.forEach((line) => {
        transaction.set(this.ledger.doc(), this.ledgerRow({ line, entryType: 'Credit', quantity: line.quantity, order, actor, note: 'Sales order cancelled' }));
      });

      return cancelled;
    });
  }
}

// After a partial delivery the customer may not want the rest. This gives the undelivered quantity back to stock
// and shrinks the order to what was actually delivered, so the order can be treated as complete.
SalesOrderService.prototype.closeShort = async function closeShort(id, reason, actor) {
  if (!String(reason || '').trim()) throw new SalesOrderError('VALIDATION', 'A reason is required');
  const orderRef = this.orders.doc(id);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new SalesOrderError('NOT_FOUND', 'Sales order not found');
    const order = { id, ...snapshot.data() };

    if (order.status !== 'In Delivery') {
      throw new SalesOrderError('LOCKED', 'Only an order with a partly delivered balance can be closed short');
    }

    const kept = order.lines.filter((line) => line.deliveredQty > 0);
    const repriced = priceLines(kept.map((line) => ({ ...line, quantity: line.deliveredQty })), order.taxType);
    const lines = repriced.lines.map((line) => {
      const original = kept.find((entry) => entry.lineNo === line.lineNo);
      return { ...line, deliveredQty: original.deliveredQty, invoicedQty: original.invoicedQty || 0 };
    });

    const now = new Date().toISOString();
    const closed = {
      ...order,
      lines,
      totals: repriced.totals,
      status: deriveOrderStatus(lines),
      version: order.version + 1,
      history: [...order.history, { at: now, by: actor.email || 'system', action: 'Undelivered balance closed', note: reason.trim() }],
      updatedAt: now,
      updatedBy: actor.email || 'system'
    };

    transaction.set(orderRef, closed);
    order.lines.forEach((line) => {
      const undelivered = Math.round((line.quantity - (line.deliveredQty || 0)) * 1000) / 1000;
      if (undelivered > 0) {
        transaction.set(this.ledger.doc(), this.ledgerRow({
          line, entryType: 'Credit', quantity: undelivered, order, actor, note: 'Undelivered balance closed'
        }));
      }
    });

    return closed;
  });
};

module.exports = SalesOrderService;
module.exports.SalesOrderError = SalesOrderError;
module.exports.SELLABLE_FLOW = SELLABLE_FLOW;
module.exports.customerAddressFields = customerAddressFields;
