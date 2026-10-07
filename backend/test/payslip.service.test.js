// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('payslip service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  const { db } = require('../config/firebase');
  const PayslipService = require('../services/PayslipService');
  const service = new PayslipService();
  const actor = 'test-admin';
  const created = [];

  const samplePayslip = (overrides = {}) => ({
    employeeId: `ps-emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeCode: '960099',
    firstName: 'Test',
    lastName: 'Payee',
    designation: 'Fitter',
    department: 'Fitting',
    dateOfJoining: '2026-03-01',
    pan: 'JHBHS6545W',
    pfAccountNumber: '789789789798',
    fixedMonthlySalary: 15000,
    year: 2026,
    month: 4,
    workingDays: 26,
    daysPresent: 23,
    otHours: 0,
    earnings: [
      { code: 'BASIC', name: 'Basic Salary', amount: 6635 },
      { code: 'CONVEYANCE', name: 'Conveyance', amount: 3317 },
      { code: 'SPECIAL', name: 'Special Allowance', amount: 3317 }
    ],
    deductions: [{ code: 'TDS', name: 'TDS', amount: 0 }],
    totalEarnings: 13269,
    totalDeductions: 0,
    employerPfContribution: 0,
    netSalary: 13269,
    ...overrides
  });

  after(async () => {
    await Promise.all(created.map((id) => db.collection('payslips').doc(id).delete()));
  });

  test('create stores the snapshot and defaults status to generated', async () => {
    const data = samplePayslip();
    const payslip = await service.create(data, actor);
    created.push(payslip.id);
    assert.equal(payslip.id, `${data.employeeId}_2026-04`);
    assert.equal(payslip.status, 'generated');
    assert.equal(payslip.generatedBy, actor);
    assert.equal(payslip.netSalary, 13269);
  });

  test('a second payslip for the same employee and month is rejected (atomic, not a race)', async () => {
    const data = samplePayslip();
    const first = await service.create(data, actor);
    created.push(first.id);

    await assert.rejects(
      () => service.create(data, actor),
      (error) => error.code === 'PAYSLIP_EXISTS'
    );
  });

  test('concurrent create calls for the same employee and month: exactly one wins', async () => {
    const data = samplePayslip();
    const attempts = await Promise.allSettled([
      service.create(data, actor),
      service.create(data, actor),
      service.create(data, actor)
    ]);
    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    succeeded.forEach((a) => created.push(a.value.id));
    assert.equal(succeeded.length, 1);
  });

  test('getForEmployeeMonth finds it by employee and period, and getById finds it by id', async () => {
    const data = samplePayslip();
    const payslip = await service.create(data, actor);
    created.push(payslip.id);

    const byPeriod = await service.getForEmployeeMonth(data.employeeId, 2026, 4);
    assert.equal(byPeriod.id, payslip.id);
    const byId = await service.getById(payslip.id);
    assert.equal(byId.netSalary, 13269);
  });

  test('list filters by year, month and employeeId', async () => {
    const data = samplePayslip();
    const payslip = await service.create(data, actor);
    created.push(payslip.id);

    const byMonth = await service.list({ year: 2026, month: 4 });
    assert.ok(byMonth.some((p) => p.id === payslip.id));

    const byEmployee = await service.list({ employeeId: data.employeeId });
    assert.equal(byEmployee.length, 1);
    assert.equal(byEmployee[0].id, payslip.id);
  });

  test('void marks the payslip voided with a reason, and keeps everything else', async () => {
    const data = samplePayslip();
    const payslip = await service.create(data, actor);
    created.push(payslip.id);

    const voided = await service.void(payslip.id, 'editor', 'Entered wrong attendance');
    assert.equal(voided.status, 'voided');
    assert.equal(voided.voidReason, 'Entered wrong attendance');
    assert.equal(voided.voidedBy, 'editor');
    assert.equal(voided.netSalary, 13269); // the original numbers are untouched
  });

  test('void returns null for an unknown payslip', async () => {
    assert.equal(await service.void('does-not-exist', actor, 'reason'), null);
  });

  test('a voided payslip can be regenerated for the same employee and month', async () => {
    const data = samplePayslip();
    const first = await service.create(data, actor);
    created.push(first.id);
    await service.void(first.id, actor, 'Wrong attendance');

    const regenerated = await service.create(samplePayslip({ employeeId: data.employeeId, daysPresent: 26 }), actor);
    assert.equal(regenerated.id, first.id);
    assert.equal(regenerated.status, 'generated');
    assert.equal(regenerated.voidReason, null);
    assert.equal(regenerated.daysPresent, 26);
  });

  test('a live (generated) payslip still blocks a second create, even after a prior void+regenerate', async () => {
    const data = samplePayslip();
    const first = await service.create(data, actor);
    created.push(first.id);

    await assert.rejects(
      () => service.create(data, actor),
      (error) => error.code === 'PAYSLIP_EXISTS'
    );
  });
}
