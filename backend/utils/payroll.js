// Pure salary math. No Firestore, no I/O - the only place this formula lives, so it's easy to test exactly.
//
// Confirmed with the owner (2026-10-07):
// - Working days in a month = days in that month - 4 (always 4, not the month's real Sunday count).
// - Basic = 50% of fixedMonthlySalary, Conveyance = 25%, Special Allowance = 25% - of the FULL salary.
//   Each of those three is then scaled by (daysPresent / workingDays) and rounded to the nearest rupee.
//   There is no separate "LOP deduction" line; the reduced attendance shows up in these three amounts.
// - Shift Allowance is NOT part of the 50/25/25 split. It's paid on top, from logged OT hours:
//     shiftAllowance = round((fixedMonthlySalary / workingDays / 8) * otHours)
//   A standard day is 8 hours. OT hours come from the Timesheet (not built yet - passed in manually for now).
// - Dearness Allowance (DA) is a reserved line, always 0, matching the sample payslip.
// - No deductions apply yet. TDS is a reserved line, always 0.
// - Employer PF contribution is informational only (it is not paid by, or subtracted from, the employee),
//   so it is not part of totalDeductions. This is a design choice, not something the owner specified -
//   flagged for when real PF deductions get built.

const BASIC_SHARE = 0.5;
const CONVEYANCE_SHARE = 0.25;
const SPECIAL_ALLOWANCE_SHARE = 0.25;
const STANDARD_HOLIDAYS_PER_MONTH = 4;
const STANDARD_HOURS_PER_DAY = 8;

// month is 1-12 (not the 0-indexed JS convention)
const getWorkingDaysInMonth = (year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth - STANDARD_HOLIDAYS_PER_MONTH;
};

// General rounding: nearest rupee, .5 rounds up.
const roundRupees = (amount) => Math.round(amount);

// daysPresent: days actually worked this month (0..workingDays). otHours: total OT hours logged this month.
const computeMonthlyPay = ({ fixedMonthlySalary, year, month, daysPresent, otHours = 0 }) => {
  if (!Number.isFinite(fixedMonthlySalary) || fixedMonthlySalary <= 0) {
    throw new Error('fixedMonthlySalary must be a positive number');
  }

  const workingDays = getWorkingDaysInMonth(year, month);

  if (!Number.isFinite(daysPresent) || daysPresent < 0 || daysPresent > workingDays) {
    throw new Error(`daysPresent must be between 0 and ${workingDays} for this month`);
  }
  if (!Number.isFinite(otHours) || otHours < 0) {
    throw new Error('otHours must be 0 or more');
  }

  const presenceRatio = daysPresent / workingDays;
  const perDaySalary = fixedMonthlySalary / workingDays;
  const perHourRate = perDaySalary / STANDARD_HOURS_PER_DAY;

  const earnings = [
    { code: 'BASIC', name: 'Basic Salary', amount: roundRupees(fixedMonthlySalary * BASIC_SHARE * presenceRatio) },
    { code: 'DA', name: 'Dearness Allowance', amount: 0 },
    { code: 'CONVEYANCE', name: 'Conveyance', amount: roundRupees(fixedMonthlySalary * CONVEYANCE_SHARE * presenceRatio) },
    { code: 'SPECIAL', name: 'Special Allowance', amount: roundRupees(fixedMonthlySalary * SPECIAL_ALLOWANCE_SHARE * presenceRatio) },
    { code: 'SHIFT', name: 'Shift Allowance', amount: roundRupees(perHourRate * otHours) }
  ];

  // Reserved for later. Employer PF is informational (see note above), not summed into totalDeductions.
  const deductions = [{ code: 'TDS', name: 'TDS', amount: 0 }];

  const totalEarnings = earnings.reduce((sum, row) => sum + row.amount, 0);
  const totalDeductions = deductions.reduce((sum, row) => sum + row.amount, 0);

  return {
    workingDays,
    daysPresent,
    otHours,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    employerPfContribution: 0,
    netSalary: totalEarnings - totalDeductions
  };
};

module.exports = {
  BASIC_SHARE,
  CONVEYANCE_SHARE,
  SPECIAL_ALLOWANCE_SHARE,
  STANDARD_HOLIDAYS_PER_MONTH,
  STANDARD_HOURS_PER_DAY,
  getWorkingDaysInMonth,
  computeMonthlyPay
};
