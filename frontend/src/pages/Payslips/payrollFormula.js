// Mirrors backend/utils/payroll.js exactly, so the generate panel can recompute live as the admin
// types without a server round trip. The server independently recomputes the same way at save time -
// this copy is only for display, never trusted for what gets stored. Keep both files in sync.

const BASIC_SHARE = 0.5;
const CONVEYANCE_SHARE = 0.25;
const SPECIAL_ALLOWANCE_SHARE = 0.25;
const STANDARD_HOLIDAYS_PER_MONTH = 4;
const STANDARD_HOURS_PER_DAY = 8;

export const getWorkingDaysInMonth = (year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth - STANDARD_HOLIDAYS_PER_MONTH;
};

const roundRupees = (amount) => Math.round(amount);

export const computeMonthlyPay = ({ fixedMonthlySalary, year, month, daysPresent, otHours }) => {
  const workingDays = getWorkingDaysInMonth(year, month);
  const valid =
    Number.isFinite(fixedMonthlySalary) &&
    fixedMonthlySalary > 0 &&
    Number.isFinite(daysPresent) &&
    daysPresent >= 0 &&
    daysPresent <= workingDays &&
    Number.isFinite(otHours) &&
    otHours >= 0;

  if (!valid) {
    return null;
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
  const deductions = [{ code: 'TDS', name: 'TDS', amount: 0 }];

  const totalEarnings = earnings.reduce((sum, row) => sum + row.amount, 0);
  const totalDeductions = deductions.reduce((sum, row) => sum + row.amount, 0);

  return {
    workingDays,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    employerPfContribution: 0,
    netSalary: totalEarnings - totalDeductions
  };
};
