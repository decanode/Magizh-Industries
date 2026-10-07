// Runs only against the Firestore emulator. Without emulator env vars it skips, so it can never reach the cloud.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const emulatorReady =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && (process.env.GCLOUD_PROJECT || '').startsWith('demo-');

if (!emulatorReady) {
  test('timesheet service (needs the Firestore emulator)', {
    skip: 'set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* to run'
  }, () => {});
} else {
  const { db } = require('../config/firebase');
  const TimesheetService = require('../services/TimesheetService');
  const service = new TimesheetService();
  const actor = 'test-admin';
  const touchedDates = new Set();

  after(async () => {
    const batch = db.batch();
    for (const date of touchedDates) {
      const snapshot = await db.collection('timesheetEntries').where('date', '==', date).get();
      snapshot.forEach((doc) => batch.delete(doc.ref));
    }
    await batch.commit();
  });

  test('saveDay stores one entry per employee, and getDay reads it back', async () => {
    const date = '2026-10-12';
    touchedDates.add(date);
    await service.saveDay(
      date,
      [
        { employeeId: 'ts-emp-1', status: 'present', otHours: 2.5 },
        { employeeId: 'ts-emp-2', status: 'absent' },
        { employeeId: 'ts-emp-3', status: 'leave', note: 'Festival' }
      ],
      actor
    );

    const day = await service.getDay(date);
    assert.equal(day['ts-emp-1'].status, 'present');
    assert.equal(day['ts-emp-1'].otHours, 2.5);
    assert.equal(day['ts-emp-2'].status, 'absent');
    assert.equal(day['ts-emp-3'].note, 'Festival');
  });

  test('re-saving a day overwrites the previous entries (corrections)', async () => {
    const date = '2026-10-13';
    touchedDates.add(date);
    await service.saveDay(date, [{ employeeId: 'ts-emp-1', status: 'absent' }], actor);
    await service.saveDay(date, [{ employeeId: 'ts-emp-1', status: 'present', otHours: 1 }], actor);

    const day = await service.getDay(date);
    assert.equal(day['ts-emp-1'].status, 'present');
    assert.equal(day['ts-emp-1'].otHours, 1);
  });

  test('getMonthlySummary aggregates day counts and OT hours per employee, and lists leave entries', async () => {
    const dates = ['2026-10-12', '2026-10-13', '2026-10-14'];
    dates.forEach((d) => touchedDates.add(d));

    await service.saveDay('2026-10-12', [{ employeeId: 'ts-emp-summary', status: 'present', otHours: 2 }], actor);
    await service.saveDay('2026-10-13', [{ employeeId: 'ts-emp-summary', status: 'leave', note: 'Sick' }], actor);
    await service.saveDay('2026-10-14', [{ employeeId: 'ts-emp-summary', status: 'absent' }], actor);

    const summary = await service.getMonthlySummary(2026, 10);
    const row = summary['ts-emp-summary'];
    assert.equal(row.presentDays, 1);
    assert.equal(row.absentDays, 1);
    assert.equal(row.leaveDays, 1);
    assert.equal(row.otHours, 2);
    assert.deepEqual(row.leaveEntries, [{ date: '2026-10-13', note: 'Sick' }]);
  });
}
