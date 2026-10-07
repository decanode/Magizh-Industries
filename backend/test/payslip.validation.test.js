const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePayslipInput } = require('../utils/payslipValidation');

const validInput = () => ({
  employeeId: 'emp-1',
  year: 2026,
  month: 4,
  daysPresent: 23,
  otHours: 2
});

test('a complete, valid payslip input passes', () => {
  assert.deepEqual(validatePayslipInput(validInput()), []);
});

test('employeeId, year and month are required', () => {
  const errors = validatePayslipInput({ ...validInput(), employeeId: '', year: undefined, month: undefined });
  assert.ok(errors.includes('employeeId is required'));
  assert.ok(errors.includes('year is required'));
  assert.ok(errors.includes('month must be between 1 and 12'));
});

test('daysPresent must fit the month (April 2026 has 26 working days)', () => {
  assert.deepEqual(validatePayslipInput({ ...validInput(), daysPresent: 27 }), [
    'daysPresent must be between 0 and 26 for this month'
  ]);
  assert.deepEqual(validatePayslipInput({ ...validInput(), daysPresent: -1 }), [
    'daysPresent must be between 0 and 26 for this month'
  ]);
});

test('otHours must be 0 or more', () => {
  assert.deepEqual(validatePayslipInput({ ...validInput(), otHours: -1 }), ['otHours must be a number of 0 or more']);
});

test('the request no longer carries earnings or deductions - extra fields are simply ignored', () => {
  // Confirms the validator does not look at these at all, even if a client still sends them.
  const input = { ...validInput(), earnings: [{ code: 'BASIC', name: 'Basic Salary', amount: 999999 }] };
  assert.deepEqual(validatePayslipInput(input), []);
});
