// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('employee service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  // Required only when the emulator is configured, because config/firebase.js exits without credentials otherwise
  const { db } = require('../config/firebase');
  const EmployeeService = require('../services/EmployeeService');
  const service = new EmployeeService();
  const actor = 'test-admin';
  const created = [];

  const sampleEmployee = (overrides = {}) => ({
    firstName: 'Test',
    lastName: 'Employee',
    designation: 'Operator',
    dateOfJoining: '2025-01-15',
    fixedMonthlySalary: 15000,
    ...overrides
  });

  const track = async (data) => {
    const employee = await service.create(data, actor);
    created.push(employee.id);
    return employee;
  };

  after(async () => {
    await Promise.all(created.map((id) => db.collection('employees').doc(id).delete()));
  });

  test('create assigns a numeric employee code and starts the employee active', async () => {
    const employee = await track(sampleEmployee());
    assert.match(employee.employeeCode, /^\d+$/);
    assert.equal(employee.status, 'active');
    assert.equal(employee.exitReason, null);
    assert.equal(employee.createdBy, actor);
  });

  test('concurrent creates never share an employee code', async () => {
    const batch = await Promise.all([1, 2, 3, 4, 5].map((i) => track(sampleEmployee({ firstName: `Batch${i}` }))));
    const codes = batch.map((e) => e.employeeCode);
    assert.equal(new Set(codes).size, codes.length);
  });

  test('getById returns the stored employee, and null for an unknown id', async () => {
    const employee = await track(sampleEmployee({ firstName: 'Lookup' }));
    const found = await service.getById(employee.id);
    assert.equal(found.firstName, 'Lookup');
    assert.equal(await service.getById('does-not-exist'), null);
  });

  test('list filters by status and searches by name or code', async () => {
    const unique = `Searchable${Date.now()}`;
    const active = await track(sampleEmployee({ firstName: unique }));
    const left = await track(sampleEmployee({ firstName: `${unique}X` }));
    await service.deactivate(left.id, actor, 'Resigned');

    const activeMatches = await service.list({ search: unique, status: 'active' });
    assert.ok(activeMatches.some((e) => e.id === active.id));
    assert.ok(!activeMatches.some((e) => e.id === left.id));

    const byCode = await service.list({ search: active.employeeCode });
    assert.ok(byCode.some((e) => e.id === active.id));
  });

  test('update changes only the given fields', async () => {
    const employee = await track(sampleEmployee({ firstName: 'Before' }));
    const updated = await service.update(employee.id, { designation: 'Senior Operator' }, 'editor');
    assert.equal(updated.designation, 'Senior Operator');
    assert.equal(updated.firstName, 'Before');
    assert.equal(updated.updatedBy, 'editor');
  });

  test('update returns null for an unknown employee', async () => {
    assert.equal(await service.update('does-not-exist', { designation: 'X' }, actor), null);
  });

  test('deactivate records the reason and the exit date, and keeps the record', async () => {
    const employee = await track(sampleEmployee({ firstName: 'Leaving' }));
    const left = await service.deactivate(employee.id, actor, 'Resigned - better opportunity');
    assert.equal(left.status, 'inactive');
    assert.equal(left.exitReason, 'Resigned - better opportunity');
    assert.ok(left.exitDate);
    const stored = await service.getById(employee.id);
    assert.equal(stored.status, 'inactive');
    assert.equal(stored.firstName, 'Leaving'); // the record is kept, not removed
  });

  test('update is blocked once an employee has left, until they are reactivated', async () => {
    const employee = await track(sampleEmployee({ firstName: 'Blocked' }));
    await service.deactivate(employee.id, actor, 'Resigned');

    await assert.rejects(
      () => service.update(employee.id, { designation: 'Should not apply' }, actor),
      (error) => error.code === 'EMPLOYEE_INACTIVE'
    );

    const reactivated = await service.reactivate(employee.id, actor);
    assert.equal(reactivated.status, 'active');
    assert.equal(reactivated.exitReason, null);
    assert.equal(reactivated.exitDate, null);

    const updated = await service.update(employee.id, { designation: 'Now allowed' }, actor);
    assert.equal(updated.designation, 'Now allowed');
  });

  test('reactivate returns null for an unknown employee', async () => {
    assert.equal(await service.reactivate('does-not-exist', actor), null);
  });
}
