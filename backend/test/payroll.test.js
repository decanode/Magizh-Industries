const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getWorkingDaysInMonth, computeMonthlyPay } = require('../utils/payroll');

test('working days = days in month - 4, regardless of the real Sunday count', () => {
  assert.equal(getWorkingDaysInMonth(2026, 4), 26); // April, 30 days
  assert.equal(getWorkingDaysInMonth(2026, 2), 24); // Feb 2026, 28 days
  assert.equal(getWorkingDaysInMonth(2026, 1), 27); // Jan, 31 days
});

// This is the owner's own worked example: 15000 salary, April (26 working days), 3 days absent.
test('golden case: the owner\'s worked example (15000, April, 3 absent) gives 13269', () => {
  const result = computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 23, otHours: 0 });
  assert.equal(result.workingDays, 26);
  const byCode = Object.fromEntries(result.earnings.map((e) => [e.code, e.amount]));
  assert.equal(byCode.BASIC, 6635);
  assert.equal(byCode.DA, 0);
  assert.equal(byCode.CONVEYANCE, 3317);
  assert.equal(byCode.SPECIAL, 3317);
  assert.equal(byCode.SHIFT, 0);
  assert.equal(result.totalEarnings, 13269);
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.netSalary, 13269);
});

test('full attendance with no OT pays exactly the fixed salary', () => {
  const result = computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 26, otHours: 0 });
  assert.equal(result.totalEarnings, 15000);
  assert.equal(result.netSalary, 15000);
});

test('zero attendance pays zero', () => {
  const result = computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 0, otHours: 0 });
  assert.equal(result.totalEarnings, 0);
});

test('shift allowance is paid on top, from OT hours at (per day salary / 8)', () => {
  // perDaySalary = 15000/26 = 576.923..., perHourRate = 72.115..., x8 hours = 576.92 -> rounds to 577
  const result = computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 26, otHours: 8 });
  const shift = result.earnings.find((e) => e.code === 'SHIFT');
  assert.equal(shift.amount, 577);
  assert.equal(result.totalEarnings, 15000 + 577);
});

test('deductions and employer PF are zero and do not reduce net pay', () => {
  const result = computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 26, otHours: 0 });
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.employerPfContribution, 0);
  assert.equal(result.netSalary, result.totalEarnings);
});

test('rejects an invalid fixed salary', () => {
  assert.throws(() => computeMonthlyPay({ fixedMonthlySalary: 0, year: 2026, month: 4, daysPresent: 10 }));
  assert.throws(() => computeMonthlyPay({ fixedMonthlySalary: -500, year: 2026, month: 4, daysPresent: 10 }));
});

test('rejects daysPresent out of range for the month', () => {
  assert.throws(() => computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 27 }));
  assert.throws(() => computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: -1 }));
});

test('rejects negative OT hours', () => {
  assert.throws(() => computeMonthlyPay({ fixedMonthlySalary: 15000, year: 2026, month: 4, daysPresent: 20, otHours: -1 }));
});
