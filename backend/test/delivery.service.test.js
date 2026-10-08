// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('delivery service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  const { db } = require('../config/firebase');
  const SalesOrderService = require('../services/SalesOrderService');
  const DeliveryService = require('../services/DeliveryService');
  const PartyService = require('../services/PartyService');
  const { financialYearOf } = require('../utils/documentNumber');

  const orders = new SalesOrderService();
  const deliveries = new DeliveryService();
  const actor = { email: 'test@example.com', firstName: 'Test' };
  const run = Math.random().toString(36).slice(2, 8);
  const fy = financialYearOf();
  const counters = ['SO', 'DC'].map((type) => db.collection('counters').doc(`${type}-${fy}`));
  let countersBefore;
  const docs = [];

  const key = () => `test-${run}-${Math.random().toString(36).slice(2)}`;
  const track = (ref) => { docs.push(ref); return ref; };

  const makeCustomer = async () => {
    const ref = track(db.collection('customers').doc());
    await ref.set({
      code: `T${run}`, name: 'Test Customer', paymentTermsDays: 45,
      addresses: [
        { id: 'bill', type: 'billing', line1: '1 Bill St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
        { id: 'ship', type: 'shipping', line1: '2 Ship St', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' },
        { id: 'ship2', type: 'shipping', line1: '3 Other St', city: 'Salem', state: 'Tamil Nadu', pincode: '636001' }
      ]
    });
    return ref.id;
  };

  const makeMaterial = async (stock) => {
    const materialCode = `T${run}${Math.floor(Math.random() * 1e6)}`;
    const ref = track(db.collection('Master_material').doc());
    await ref.set({
      materialCode, materialName: `Widget ${materialCode}`, materialFlow: 'FIN', class: 'F', unit: 'EA',
      catNo: 'C1', hsnCode: '8537', cgst: '9', sgst: '9', igst: '', costPerItem: '100', status: 'active'
    });
    await track(db.collection('Stock_Entry').doc()).set({
      materialCode, materialName: `Widget ${materialCode}`, quantity: stock, unit: 'EA', entryType: 'Credit', createdAt: new Date().toISOString()
    });
    return { id: ref.id, materialCode };
  };

  const balanceOf = async (materialCode) =>
    SalesOrderService.sumLedger(await db.collection('Stock_Entry').where('materialCode', '==', materialCode).get());

  // An order of `quantity` units of one fresh material, ready to be delivered
  const makeOrder = async (quantity, extraLines = []) => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(100);
    const requestKey = key();
    const order = await orders.create({
      customerId, billToId: 'bill', shipToId: 'ship',
      lines: [{ materialId: material.id, quantity, unitPrice: 100 }, ...extraLines]
    }, actor, requestKey);
    track(db.collection('sales_orders').doc(order.id));
    track(db.collection('Request_tracking').doc(`so-${requestKey}`));
    return { order, material, customerId };
  };

  const deliver = async (orderId, quantity, extra = {}) => {
    const requestKey = key();
    const delivery = await deliveries.create(orderId, { lines: [{ lineNo: 1, quantity }], ...extra }, actor, requestKey);
    track(db.collection('deliveries').doc(delivery.id));
    track(db.collection('Request_tracking').doc(`dc-${requestKey}`));
    return delivery;
  };

  before(async () => { countersBefore = await Promise.all(counters.map((ref) => ref.get())); });

  after(async () => {
    const posted = await db.collection('Stock_Entry').where('refType', '==', 'SalesOrder').get();
    await Promise.all(posted.docs.filter((d) => String(d.data().materialCode).startsWith(`T${run}`)).map((d) => d.ref.delete()));
    await Promise.all(docs.map((ref) => ref.delete()));
    await Promise.all(counters.map((ref, i) => (countersBefore[i].exists ? ref.set(countersBefore[i].data()) : ref.delete())));
  });

  test('a delivery is numbered MI/DC-nnnn/FY, priced from the order and moves the order to In Delivery', async () => {
    const { order, material } = await makeOrder(10);
    const stockBefore = await balanceOf(material.materialCode);

    const delivery = await deliver(order.id, 4);

    assert.match(delivery.dcNumber, new RegExp(`^MI/DC-\\d{4}/${fy}$`));
    assert.equal(delivery.status, 'Created');
    assert.equal(delivery.costingConfirmed, false);
    assert.equal(delivery.totals.subtotal, 400);
    assert.equal(delivery.totals.grandTotal, 472);
    assert.equal(delivery.shipTo.id, 'ship');
    assert.equal(delivery.lines[0].soLineNo, 1);

    const updated = await orders.getById(order.id);
    assert.equal(updated.status, 'In Delivery');
    assert.equal(updated.lines[0].deliveredQty, 4);
    assert.equal(await balanceOf(material.materialCode), stockBefore, 'delivering must not move stock again');
  });

  test('a delivery can go to a different ship-to address, but not to an unknown one', async () => {
    const { order } = await makeOrder(10);

    const delivery = await deliver(order.id, 1, { shipToId: 'ship2' });
    assert.equal(delivery.shipTo.city, 'Salem');

    await assert.rejects(() => deliveries.create(order.id, { shipToId: 'bill', lines: [{ lineNo: 1, quantity: 1 }] }, actor, key()), { code: 'VALIDATION' });
  });

  test('more than the undelivered quantity is rejected and changes nothing; finishing the order marks it Delivered', async () => {
    const { order } = await makeOrder(10);
    await deliver(order.id, 6);

    await assert.rejects(
      () => deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 5 }] }, actor, key()),
      (error) => {
        assert.equal(error.code, 'OVER_DELIVERY');
        assert.equal(error.details[0].remaining, 4);
        return true;
      }
    );
    assert.equal((await orders.getById(order.id)).lines[0].deliveredQty, 6);

    await deliver(order.id, 4);
    assert.equal((await orders.getById(order.id)).status, 'Delivered');
    await assert.rejects(() => deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 1 }] }, actor, key()), { code: 'LOCKED' });
  });

  test('two deliveries racing for the same remaining quantity cannot both succeed', async () => {
    const { order } = await makeOrder(10);

    const attempts = await Promise.allSettled([
      deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 7 }] }, actor, key()),
      deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 7 }] }, actor, key())
    ]);

    attempts.filter((a) => a.status === 'fulfilled').forEach((a) => track(db.collection('deliveries').doc(a.value.id)));
    assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
    assert.equal(attempts.find((a) => a.status === 'rejected').reason.code, 'OVER_DELIVERY');
    assert.equal((await orders.getById(order.id)).lines[0].deliveredQty, 7);
  });

  test('repeating a request with the same idempotency key does not create a second delivery', async () => {
    const { order } = await makeOrder(10);
    const requestKey = key();

    const first = await deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 3 }] }, actor, requestKey);
    track(db.collection('deliveries').doc(first.id));
    track(db.collection('Request_tracking').doc(`dc-${requestKey}`));
    const again = await deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 3 }] }, actor, requestKey);

    assert.equal(again.id, first.id);
    assert.equal((await orders.getById(order.id)).lines[0].deliveredQty, 3);
  });

  test('prices can change until the customer confirms the costing, then they are locked', async () => {
    const { order } = await makeOrder(10);
    const delivery = await deliver(order.id, 2);

    const repriced = await deliveries.update(delivery.id, { version: 1, lines: [{ soLineNo: 1, unitPrice: 110 }] }, actor);
    assert.equal(repriced.totals.subtotal, 220);
    assert.equal(repriced.version, 2);

    const confirmed = await deliveries.setCostingConfirmation(delivery.id, true, 'Approved by email 12 Oct', actor);
    assert.equal(confirmed.costingConfirmed, true);
    assert.equal(confirmed.costingConfirmedBy, actor.email);

    await assert.rejects(
      () => deliveries.update(delivery.id, { version: 3, lines: [{ soLineNo: 1, unitPrice: 120 }] }, actor),
      { code: 'LOCKED' }
    );
    // Transport details are still editable
    const withTransport = await deliveries.update(delivery.id, { version: 3, vehicleNumber: 'tn 38 ab 1234' }, actor);
    assert.equal(withTransport.vehicleNumber, 'TN 38 AB 1234');

    await deliveries.setCostingConfirmation(delivery.id, false, '', actor);
    const again = await deliveries.update(delivery.id, { version: 5, lines: [{ soLineNo: 1, unitPrice: 120 }] }, actor);
    assert.equal(again.totals.subtotal, 240);
  });

  test('cancelling a delivery returns its quantity to the order; a confirmed costing blocks it', async () => {
    const { order } = await makeOrder(10);
    const delivery = await deliver(order.id, 4);

    await deliveries.setCostingConfirmation(delivery.id, true, 'ok', actor);
    await assert.rejects(() => deliveries.cancel(delivery.id, 'wrong', actor), { code: 'LOCKED' });
    await deliveries.setCostingConfirmation(delivery.id, false, '', actor);

    await assert.rejects(() => deliveries.cancel(delivery.id, '', actor), { code: 'VALIDATION' });
    const cancelled = await deliveries.cancel(delivery.id, 'Wrong quantity', actor);
    assert.equal(cancelled.status, 'Cancelled');

    const reopened = await orders.getById(order.id);
    assert.equal(reopened.lines[0].deliveredQty, 0);
    assert.equal(reopened.status, 'Open');
    await assert.rejects(() => deliveries.cancel(delivery.id, 'again', actor), { code: 'LOCKED' });
  });

  test('after a delivery the order keeps only price/date/note edits, cannot be cancelled, and keeps its line numbers', async () => {
    const { order, material, customerId } = await makeOrder(10);
    await deliver(order.id, 4);
    const base = { customerId, billToId: 'bill', shipToId: 'ship', version: 2 };

    await assert.rejects(
      () => orders.update(order.id, { ...base, lines: [{ materialId: material.id, quantity: 8, unitPrice: 100 }] }, actor),
      { code: 'LOCKED' }
    );
    await assert.rejects(() => orders.update(order.id, { ...base, billToId: 'bill', taxType: 'INTER', lines: [{ materialId: material.id, quantity: 10, unitPrice: 100 }] }, actor), { code: 'LOCKED' });

    const repriced = await orders.update(order.id, { ...base, lines: [{ materialId: material.id, quantity: 10, unitPrice: 105 }] }, actor);
    assert.equal(repriced.lines[0].unitPrice, 105);
    assert.equal(repriced.lines[0].lineNo, 1);
    assert.equal(repriced.lines[0].deliveredQty, 4);
    assert.equal(repriced.status, 'In Delivery');

    await assert.rejects(() => orders.cancel(order.id, 'no', actor), { code: 'LOCKED' });
  });

  test('closing the undelivered balance returns that stock and completes the order', async () => {
    const { order, material } = await makeOrder(10);
    assert.equal(await balanceOf(material.materialCode), 90);
    await deliver(order.id, 4);

    await assert.rejects(() => orders.closeShort(order.id, '', actor), { code: 'VALIDATION' });
    const closed = await orders.closeShort(order.id, 'Customer needs only 4', actor);

    assert.equal(closed.status, 'Delivered');
    assert.equal(closed.lines[0].quantity, 4);
    assert.equal(closed.totals.subtotal, 400);
    assert.equal(await balanceOf(material.materialCode), 96);
    await assert.rejects(() => orders.closeShort(order.id, 'again', actor), { code: 'LOCKED' });
  });

  // Archiving moves the customer to the archive collection, exactly as the Customer Master's Delete does
  const archiveCustomer = async (customerId) => {
    const ref = db.collection('customers').doc(customerId);
    const archivedRef = track(db.collection('customers_archive').doc(customerId));
    await archivedRef.set((await ref.get()).data());
    await ref.delete();
  };

  test('an archived customer is still readable, flagged as archived', async () => {
    const customers = new PartyService({ collectionName: 'customers', archiveCollectionName: 'customers_archive', counterName: 'customer', firstNumber: 50001 });
    const { customerId } = await makeOrder(10);

    assert.equal((await customers.getById(customerId)).archived, undefined);
    await archiveCustomer(customerId);

    const archived = await customers.getById(customerId);
    assert.equal(archived.archived, true);
    assert.equal(archived.name, 'Test Customer');
    assert.equal(archived.addresses.length, 3);
    assert.equal(await customers.getById('does-not-exist'), null);
  });

  test('new deliveries and order changes for an archived customer are refused with a clear message', async () => {
    const { order, material, customerId } = await makeOrder(10);
    await archiveCustomer(customerId);

    await assert.rejects(() => deliveries.create(order.id, { lines: [{ lineNo: 1, quantity: 1 }] }, actor, key()), (error) => {
      assert.equal(error.code, 'LOCKED');
      assert.match(error.message, /archived/);
      return true;
    });
    await assert.rejects(
      () => orders.update(order.id, { customerId, billToId: 'bill', shipToId: 'ship', version: order.version, lines: [{ materialId: material.id, quantity: 5, unitPrice: 100 }] }, actor),
      { code: 'LOCKED' }
    );
    // Cancelling needs no customer lookup, so an order of an archived customer can still be cancelled
    assert.equal((await orders.cancel(order.id, 'customer archived', actor)).status, 'Cancelled');
  });
}
