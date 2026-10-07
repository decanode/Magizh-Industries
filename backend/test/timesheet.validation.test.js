const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSunday, validateDayEntries } = require('../utils/timesheetValidation');

test('isSunday detects the real calendar Sunday', () => {
  assert.equal(isSunday('2026-10-11'), true); // a Sunday
  assert.equal(isSunday('2026-10-12'), false); // a Monday
});

test('a valid day of entries passes validation', () => {
  const errors = validateDayEntries('2026-10-12', [
    { employeeId: 'e1', status: 'present', otHours: 2 },
    { employeeId: 'e2', status: 'absent' },
    { employeeId: 'e3', status: 'leave', note: 'Festival' }
  ]);
  assert.deepEqual(errors, []);
});

test('rejects a Sunday entirely', () => {
  const errors = validateDayEntries('2026-10-11', [{ employeeId: 'e1', status: 'present' }]);
  assert.ok(errors.some((e) => e.includes('Sunday')));
});

test('rejects a bad date format', () => {
  assert.ok(validateDayEntries('12-10-2026', []).some((e) => e.includes('date')));
});

test('rejects an unknown status', () => {
  const errors = validateDayEntries('2026-10-12', [{ employeeId: 'e1', status: 'late' }]);
  assert.ok(errors.some((e) => e.includes('status')));
});

test('OT hours are rejected on a non-present day', () => {
  const errors = validateDayEntries('2026-10-12', [{ employeeId: 'e1', status: 'absent', otHours: 2 }]);
  assert.ok(errors.some((e) => e.includes('otHours can only be entered on a present day')));
});

test('OT hours must be 0 or more', () => {
  const errors = validateDayEntries('2026-10-12', [{ employeeId: 'e1', status: 'present', otHours: -1 }]);
  assert.ok(errors.some((e) => e.includes('otHours')));
});

test('rejects a duplicate employee in the same day', () => {
  const errors = validateDayEntries('2026-10-12', [
    { employeeId: 'e1', status: 'present' },
    { employeeId: 'e1', status: 'absent' }
  ]);
  assert.ok(errors.some((e) => e.includes('duplicate entry')));
});

test('rejects entries that are not an array', () => {
  assert.deepEqual(validateDayEntries('2026-10-12', 'nope'), ['entries must be an array']);
});
