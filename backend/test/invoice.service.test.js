// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('invoice service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  const { db } = require('../config/firebase');
  const SalesOrderService = require('../services/SalesOrderService');
  const DeliveryService = require('../services/DeliveryService');
  const InvoiceService = require('../services/InvoiceService');
  const { financialYearOf, firstNumberFor, formatDocumentNumber, todayIst } = require('../utils/documentNumber');

  const orders = new SalesOrderService();
  const deliveries = new DeliveryService();
  const invoices = new InvoiceService();
  const actor = { email: 'test@example.com', firstName: 'Test' };
  const run = Math.random().toString(36).slice(2, 8);
  const fy = financialYearOf();
  const counters = ['SO', 'DC', 'INV'].map((type) => db.collection('counters').doc(`${type}-${fy}`));
  let countersBefore;
  const docs = [];

  const key = () => `test-${run}-${Math.random().toString(36).slice(2)}`;
  const track = (ref) => { docs.push(ref); return ref; };

  const makeCustomer = async () => {
    const ref = track(db.collection('customers').doc());
    await ref.set({
      code: `T${run}`, name: 'Test Customer', paymentTermsDays: 45, gstin: '33AAAAA0000A1Z5',
      addresses: [
        { id: 'bill', type: 'billing', line1: '1 Bill St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
        { id: 'ship', type: 'shipping', line1: '2 Ship St', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' }
      ]
    });
    return ref.id;
  };

  const makeMaterial = async (hsnCode = '8537') => {
    const materialCode = `T${run}${Math.floor(Math.random() * 1e6)}`;
    const ref = track(db.collection('Master_material').doc());
    await ref.set({
      materialCode, materialName: `Widget ${materialCode}`, materialFlow: 'FIN', class: 'F', unit: 'EA',
      catNo: 'C1', hsnCode, cgst: '9', sgst: '9', igst: '', costPerItem: '100', status: 'active'
    });
    await track(db.collection('Stock_Entry').doc()).set({
      materialCode, materialName: `Widget ${materialCode}`, quantity: 100, unit: 'EA', entryType: 'Credit', createdAt: new Date().toISOString()
    });
    return { id: ref.id, ref, materialCode };
  };

  // A delivery of 4 units out of an order of 10, with costing confirmed unless asked otherwise
  const makeDelivery = async ({ confirmed = true, hsnCode } = {}) => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(hsnCode);
    const orderKey = key();
    const order = await orders.create({
      customerId, billToId: 'bill', shipToId: 'ship', lines: [{ materialId: material.id, quantity: 10, unitPrice: 100 }]
    }, actor, orderKey);
    track(db.collection('sales_orders').doc(order.id));
    track(db.collection('Request_tracking').doc(`so-${orderKey}`));

    const deliveryKey = key();
    const delivery = await deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 4 }] }, actor, deliveryKey);
    track(db.collection('deliveries').doc(delivery.id));
    track(db.collection('Request_tracking').doc(`dc-${deliveryKey}`));
    if (confirmed) await deliveries.setCostingConfirmation(delivery.id, true, 'approved by email', actor);
    return { order, delivery, material };
  };

  const invoice = async (deliveryId, input = {}) => {
    const requestKey = key();
    const created = await invoices.createFromDelivery(deliveryId, input, actor, requestKey);
    track(db.collection('invoices').doc(created.id));
    track(db.collection('Request_tracking').doc(`inv-${requestKey}`));
    return created;
  };

  before(async () => { countersBefore = await Promise.all(counters.map((ref) => ref.get())); });

  after(async () => {
    const posted = await db.collection('Stock_Entry').where('refType', '==', 'SalesOrder').get();
    await Promise.all(posted.docs.filter((d) => String(d.data().materialCode).startsWith(`T${run}`)).map((d) => d.ref.delete()));
    await Promise.all(docs.map((ref) => ref.delete()));
    await Promise.all(counters.map((ref, i) => (countersBefore[i].exists ? ref.set(countersBefore[i].data()) : ref.delete())));
  });

  test('an invoice cannot be created until the customer has confirmed the costing', async () => {
    const { delivery } = await makeDelivery({ confirmed: false });

    await assert.rejects(() => invoices.createFromDelivery(delivery.id, {}, actor, key()), { code: 'COSTING_NOT_CONFIRMED' });
    assert.equal((await deliveries.getById(delivery.id)).invoiceId, null);
  });

  test('the first invoice of a year uses the agreed start number, then counts up', async () => {
    await counters[2].delete();
    const first = await makeDelivery();
    const second = await makeDelivery();

    const one = await invoice(first.delivery.id);
    const two = await invoice(second.delivery.id);

    const start = firstNumberFor('INV', fy);
    assert.equal(one.invoiceNumber, formatDocumentNumber('INV', start, fy));
    assert.equal(two.invoiceNumber, formatDocumentNumber('INV', start + 1, fy));
    if (fy === '26-27') assert.equal(one.invoiceNumber, `MI/INV-039/${fy}`);
  });

  test('an issued invoice copies the confirmed delivery, uses today\'s HSN and sets the due date from the terms', async () => {
    const { order, delivery, material } = await makeDelivery({ hsnCode: '8537' });
    await material.ref.update({ hsnCode: '853710' }); // corrected in the master after the order was taken

    const created = await invoice(delivery.id, { invoiceDate: todayIst(), paymentTermsDays: 30 });

    assert.equal(created.status, 'Issued');
    assert.equal(created.lines[0].hsnCode, '853710');
    assert.equal(created.lines[0].quantity, 4);
    assert.equal(created.totals.grandTotal, 472);
    assert.equal(created.dcNumber, delivery.dcNumber);
    assert.equal(created.soNumber, order.soNumber);
    assert.equal(created.customer.gstin, '33AAAAA0000A1Z5');
    assert.equal(created.paymentTermsDays, 30);
    const due = new Date(`${todayIst()}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    assert.equal(created.dueDate, due.toISOString().slice(0, 10));
  });

  test('missing HSN is a hard stop that names the material and burns no number', async () => {
    const { delivery, material } = await makeDelivery({ hsnCode: '' });

    await assert.rejects(
      () => invoices.createFromDelivery(delivery.id, {}, actor, key()),
      (error) => {
        assert.equal(error.code, 'MISSING_HSN');
        assert.equal(error.details[0].materialCode, material.materialCode);
        return true;
      }
    );
    await material.ref.update({ hsnCode: '8537' });
    assert.equal((await invoice(delivery.id)).lines[0].hsnCode, '8537');
  });

  test('only one invoice per delivery, even when two are requested at once', async () => {
    const { delivery } = await makeDelivery();

    const attempts = await Promise.allSettled([
      invoices.createFromDelivery(delivery.id, {}, actor, key()),
      invoices.createFromDelivery(delivery.id, {}, actor, key())
    ]);
    attempts.filter((a) => a.status === 'fulfilled').forEach((a) => track(db.collection('invoices').doc(a.value.id)));

    assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
    assert.equal(attempts.find((a) => a.status === 'rejected').reason.code, 'ALREADY_INVOICED');
    await assert.rejects(() => invoices.createFromDelivery(delivery.id, {}, actor, key()), { code: 'ALREADY_INVOICED' });
  });

  test('repeating a request with the same idempotency key returns the same invoice', async () => {
    const { delivery } = await makeDelivery();
    const requestKey = key();

    const first = await invoices.createFromDelivery(delivery.id, {}, actor, requestKey);
    track(db.collection('invoices').doc(first.id));
    track(db.collection('Request_tracking').doc(`inv-${requestKey}`));
    const again = await invoices.createFromDelivery(delivery.id, {}, actor, requestKey);

    assert.equal(again.id, first.id);
  });

  test('invoicing locks the delivery and the order line price', async () => {
    const { order, delivery, material } = await makeDelivery();
    const created = await invoice(delivery.id);

    const locked = await deliveries.getById(delivery.id);
    assert.equal(locked.invoiceId, created.id);
    assert.equal(locked.invoiceNumber, created.invoiceNumber);
    await assert.rejects(() => deliveries.update(delivery.id, { version: locked.version, vehicleNumber: 'X' }, actor), { code: 'LOCKED' });
    await assert.rejects(() => deliveries.setCostingConfirmation(delivery.id, false, '', actor), { code: 'LOCKED' });
    await assert.rejects(() => deliveries.cancel(delivery.id, 'no', actor), { code: 'LOCKED' });

    const current = await orders.getById(order.id);
    assert.equal(current.lines[0].invoicedQty, 4);
    await assert.rejects(
      () => orders.update(order.id, {
        customerId: current.customerId, billToId: 'bill', shipToId: 'ship', version: current.version,
        lines: [{ materialId: material.id, quantity: 10, unitPrice: 120 }]
      }, actor),
      { code: 'LOCKED' }
    );
  });

  test('an unpaid invoice past its due date is overdue', async () => {
    const { delivery } = await makeDelivery();
    const created = await invoice(delivery.id, { invoiceDate: `${fy.slice(0, 2).padStart(2, '0') && `20${fy.slice(0, 2)}`}-04-01`, paymentTermsDays: 0 });

    const loaded = await invoices.getById(created.id);
    assert.equal(loaded.overdue, todayIst() > loaded.dueDate);
    assert.ok(!loaded.overdue || loaded.daysOverdue > 0);
    const overdueList = await invoices.list({ status: 'Overdue' });
    assert.equal(overdueList.some((item) => item.id === created.id), loaded.overdue);
  });

  test('the invoice date cannot be in the future', async () => {
    const { delivery } = await makeDelivery();
    await assert.rejects(() => invoices.createFromDelivery(delivery.id, { invoiceDate: '2999-01-01' }, actor, key()), { code: 'VALIDATION' });
  });

  test('cancelling releases the delivery, keeps the number used, and a corrected invoice gets the next number', async () => {
    const { order, delivery } = await makeDelivery();
    const wrong = await invoice(delivery.id);

    await assert.rejects(() => invoices.cancel(wrong.id, '', actor), { code: 'VALIDATION' });
    const cancelled = await invoices.cancel(wrong.id, 'Wrong customer address', actor);
    assert.equal(cancelled.status, 'Cancelled');
    await assert.rejects(() => invoices.cancel(wrong.id, 'again', actor), { code: 'LOCKED' });

    const released = await deliveries.getById(delivery.id);
    assert.equal(released.invoiceId, null);
    assert.equal((await orders.getById(order.id)).lines[0].invoicedQty, 0);

    const corrected = await invoice(delivery.id);
    const sequence = (invoiceNumber) => Number(invoiceNumber.split('-')[1].split('/')[0]);
    assert.equal(sequence(corrected.invoiceNumber), sequence(wrong.invoiceNumber) + 1);
    assert.equal((await invoices.getById(wrong.id)).status, 'Cancelled');
  });

  test('the person invoicing can override each item\'s description and HSN/SAC', async () => {
    const { delivery } = await makeDelivery();

    const created = await invoice(delivery.id, {
      lines: [{ soLineNo: 1, description: 'Service charge for part assembled switch board', hsnCode: '998875' }]
    });

    assert.equal(created.lines[0].description, 'Service charge for part assembled switch board');
    assert.equal(created.lines[0].hsnCode, '998875');
    assert.equal(created.lines[0].materialName.startsWith('Widget'), true, 'the material name is still on record');
  });

  test('without overrides the description is the material name and the HSN comes from the master', async () => {
    const { delivery } = await makeDelivery({ hsnCode: '8537' });
    const created = await invoice(delivery.id);
    assert.equal(created.lines[0].description, created.lines[0].materialName);
    assert.equal(created.lines[0].hsnCode, '8537');
    assert.equal(created.quotationNumber, '');
  });

  test('an invalid HSN/SAC override is a hard stop', async () => {
    const { delivery } = await makeDelivery();
    await assert.rejects(
      () => invoices.createFromDelivery(delivery.id, { lines: [{ soLineNo: 1, hsnCode: '12' }] }, actor, key()),
      { code: 'MISSING_HSN' }
    );
  });

  test('the HALB (customer quotation) number flows from the order through the delivery to the invoice', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial();
    const orderKey = key();
    const order = await orders.create({
      customerId, billToId: 'bill', shipToId: 'ship', quotationNumber: '  SYRD976VMCMOL ',
      lines: [{ materialId: material.id, quantity: 5, unitPrice: 100 }]
    }, actor, orderKey);
    track(db.collection('sales_orders').doc(order.id));
    track(db.collection('Request_tracking').doc(`so-${orderKey}`));
    assert.equal(order.quotationNumber, 'SYRD976VMCMOL');

    const deliveryKey = key();
    const delivery = await deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 5 }] }, actor, deliveryKey);
    track(db.collection('deliveries').doc(delivery.id));
    track(db.collection('Request_tracking').doc(`dc-${deliveryKey}`));
    assert.equal(delivery.quotationNumber, 'SYRD976VMCMOL');

    await deliveries.setCostingConfirmation(delivery.id, true, 'ok', actor);
    assert.equal((await invoice(delivery.id)).quotationNumber, 'SYRD976VMCMOL');
  });
}
