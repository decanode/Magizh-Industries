// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('sales order service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  const { db } = require('../config/firebase');
  const SalesOrderService = require('../services/SalesOrderService');
  const stockEntryService = require('../services/stockEntryService');
  const { financialYearOf } = require('../utils/documentNumber');

  const service = new SalesOrderService();
  const actor = { email: 'test@example.com', firstName: 'Test' };
  const run = Math.random().toString(36).slice(2, 8);
  const counterRef = db.collection('counters').doc(`SO-${financialYearOf()}`);
  let counterBefore;
  const docs = [];

  const key = () => `test-${run}-${Math.random().toString(36).slice(2)}`;
  const track = (ref) => { docs.push(ref); return ref; };

  const makeCustomer = async (billState = 'Tamil Nadu') => {
    const ref = track(db.collection('customers').doc());
    await ref.set({
      code: `T${run}`, name: 'Test Customer', gstin: '33AAAAA0000A1Z5', paymentTermsDays: 45,
      addresses: [
        { id: 'bill', type: 'billing', line1: '1 Bill St', city: 'Chennai', state: billState, pincode: '600001' },
        { id: 'ship', type: 'shipping', line1: '2 Ship St', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' }
      ]
    });
    return ref.id;
  };

  const makeMaterial = async (stock, overrides = {}) => {
    const materialCode = `T${run}${Math.floor(Math.random() * 1e6)}`;
    const ref = track(db.collection('Master_material').doc());
    await ref.set({
      materialCode, materialName: `Widget ${materialCode}`, materialFlow: 'FIN', class: 'F', unit: 'EA',
      catNo: 'C1', hsnCode: '8537', cgst: '9', sgst: '9', igst: '', costPerItem: '100', status: 'active', ...overrides
    });
    if (stock) {
      await track(db.collection('Stock_Entry').doc()).set({
        materialCode, materialName: `Widget ${materialCode}`, quantity: stock, unit: 'EA', entryType: 'Credit', createdAt: new Date().toISOString()
      });
    }
    return { id: ref.id, materialCode };
  };

  const balanceOf = async (materialCode) =>
    SalesOrderService.sumLedger(await db.collection('Stock_Entry').where('materialCode', '==', materialCode).get());

  const order = (customerId, materialId, quantity, extra = {}) => ({
    customerId, billToId: 'bill', shipToId: 'ship',
    lines: [{ materialId, quantity, unitPrice: 100 }], ...extra
  });

  const trackOrder = (created) => {
    track(db.collection('sales_orders').doc(created.id));
    track(db.collection('Request_tracking').doc(`so-${created.requestKey}`));
    return created;
  };

  // Removes every ledger row an order posted, since they carry the order's id
  const cleanLedger = async () => {
    const posted = await db.collection('Stock_Entry').where('refType', '==', 'SalesOrder').get();
    await Promise.all(posted.docs.filter((d) => String(d.data().materialCode).startsWith(`T${run}`)).map((d) => d.ref.delete()));
  };

  before(async () => { counterBefore = await counterRef.get(); });

  after(async () => {
    await cleanLedger();
    await Promise.all(docs.map((ref) => ref.delete()));
    // Put the order-number counter back so test runs never use up real numbers
    if (counterBefore.exists) await counterRef.set(counterBefore.data());
    else await counterRef.delete();
  });

  const create = async (input) => {
    const requestKey = key();
    const created = await service.create(input, actor, requestKey);
    return trackOrder({ ...created, requestKey });
  };

  test('creating an order numbers it MI/SO-nnnn/FY, prices it and takes the stock', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(50);

    const created = await create(order(customerId, material.id, 3));

    assert.match(created.soNumber, new RegExp(`^MI/SO-\\d{4}/${financialYearOf()}$`));
    assert.equal(created.status, 'Open');
    assert.equal(created.taxType, 'INTRA');
    assert.equal(created.totals.subtotal, 300);
    assert.equal(created.totals.cgst, 27);
    assert.equal(created.totals.sgst, 27);
    assert.equal(created.totals.grandTotal, 354);
    assert.equal(created.lines[0].hsnCode, '8537');
    assert.equal(await balanceOf(material.materialCode), 47);
  });

  test('an out-of-state bill-to uses IGST only', async () => {
    const customerId = await makeCustomer('Karnataka');
    const material = await makeMaterial(10);

    const created = await create(order(customerId, material.id, 2));

    assert.equal(created.taxType, 'INTER');
    assert.equal(created.totals.igst, 36);
    assert.equal(created.totals.cgst, 0);
    assert.equal(created.totals.sgst, 0);
  });

  test('insufficient stock is a hard stop: no order, no stock movement, no number used up', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(5);

    await assert.rejects(
      () => service.create(order(customerId, material.id, 6), actor, key()),
      (error) => {
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.deepEqual(error.details.map((d) => [d.requested, d.available]), [[6, 5]]);
        return true;
      }
    );
    assert.equal(await balanceOf(material.materialCode), 5);

    const first = await create(order(customerId, material.id, 1));
    const second = await create(order(customerId, material.id, 1));
    const sequence = (n) => Number(n.soNumber.split('-')[1].split('/')[0]);
    assert.equal(sequence(second), sequence(first) + 1);
  });

  test('two orders racing for the same stock cannot both succeed', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);

    const attempts = await Promise.allSettled([
      service.create(order(customerId, material.id, 7), actor, key()),
      service.create(order(customerId, material.id, 7), actor, key())
    ]);

    const won = attempts.filter((a) => a.status === 'fulfilled');
    const lost = attempts.filter((a) => a.status === 'rejected');
    won.forEach((a) => trackOrder({ ...a.value, requestKey: 'unused' }));
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.code, 'INSUFFICIENT_STOCK');
    assert.equal(await balanceOf(material.materialCode), 3);
  });

  test('repeating a request with the same idempotency key does not create a second order', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);
    const requestKey = key();

    const first = await service.create(order(customerId, material.id, 2), actor, requestKey);
    trackOrder({ ...first, requestKey });
    const again = await service.create(order(customerId, material.id, 2), actor, requestKey);

    assert.equal(again.id, first.id);
    assert.equal(await balanceOf(material.materialCode), 8);
  });

  test('validation: unknown address, duplicate material and non-finished goods are rejected', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);
    const rawMaterial = await makeMaterial(10, { materialFlow: 'BOM' });

    await assert.rejects(() => service.create({ ...order(customerId, material.id, 1), shipToId: 'bill' }, actor, key()), { code: 'VALIDATION' });
    await assert.rejects(
      () => service.create({ customerId, billToId: 'bill', shipToId: 'ship', lines: [
        { materialId: material.id, quantity: 1, unitPrice: 1 }, { materialId: material.id, quantity: 1, unitPrice: 1 }
      ] }, actor, key()),
      { code: 'VALIDATION' }
    );
    await assert.rejects(() => service.create(order(customerId, rawMaterial.id, 1), actor, key()), { code: 'VALIDATION' });
    assert.equal(await balanceOf(material.materialCode), 10);
  });

  test('changing quantities moves only the difference and respects available stock', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);
    const created = await create(order(customerId, material.id, 4));
    assert.equal(await balanceOf(material.materialCode), 6);

    const smaller = await service.update(created.id, { ...order(customerId, material.id, 1), version: 1 }, actor);
    assert.equal(smaller.version, 2);
    assert.equal(await balanceOf(material.materialCode), 9);

    await assert.rejects(
      () => service.update(created.id, { ...order(customerId, material.id, 12), version: 2 }, actor),
      { code: 'INSUFFICIENT_STOCK' }
    );
    assert.equal(await balanceOf(material.materialCode), 9);

    await assert.rejects(
      () => service.update(created.id, { ...order(customerId, material.id, 2), version: 1 }, actor),
      { code: 'CONFLICT' }
    );
  });

  test('cancelling returns the stock with reversing entries and cannot be repeated', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);
    const created = await create(order(customerId, material.id, 4));

    const cancelled = await service.cancel(created.id, 'Customer withdrew', actor);

    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(await balanceOf(material.materialCode), 10);
    await assert.rejects(() => service.cancel(created.id, 'again', actor), { code: 'LOCKED' });
    await assert.rejects(() => service.cancel(created.id, '', actor), { code: 'VALIDATION' });
  });

  test('stock rows posted by an order cannot be edited or deleted by hand', async () => {
    const customerId = await makeCustomer();
    const material = await makeMaterial(10);
    await create(order(customerId, material.id, 2));

    const posted = await db.collection('Stock_Entry').where('materialCode', '==', material.materialCode).where('refType', '==', 'SalesOrder').get();
    assert.equal(posted.size, 1);
    await assert.rejects(() => stockEntryService.update(posted.docs[0].id, { quantity: 1 }), /cannot be edited/);
    await assert.rejects(() => stockEntryService.delete(posted.docs[0].id), /cannot be deleted/);
  });
}
