const { getWorkingDaysInMonth } = require('./payroll');

// Validates a payslip generate request. Only employeeId, year, month, daysPresent and otHours are
// ever accepted - every amount is computed from the formula (see controllers/payslip.js), never
// taken from the client.
const validatePayslipInput = ({ employeeId, year, month, daysPresent, otHours }) => {
  const errors = [];

  if (!employeeId) errors.push('employeeId is required');
  if (!Number.isInteger(year)) errors.push('year is required');
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('month must be between 1 and 12');

  if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
    const workingDays = getWorkingDaysInMonth(year, month);
    const present = Number(daysPresent);
    if (!Number.isFinite(present) || present < 0 || present > workingDays) {
      errors.push(`daysPresent must be between 0 and ${workingDays} for this month`);
    }
  }

  const ot = Number(otHours);
  if (!Number.isFinite(ot) || ot < 0) {
    errors.push('otHours must be a number of 0 or more');
  }

  return errors;
};

module.exports = { validatePayslipInput };
