const STATUSES = ['present', 'absent', 'leave'];

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(String(value));
};

// Sundays are always a standard holiday (see backend/utils/payroll.js) - no timesheet entry is ever needed for one.
const isSunday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 0;

// One day's bulk save: { entries: [{ employeeId, status, otHours, note }] }
const validateDayEntries = (date, entries) => {
  const errors = [];

  if (!isIsoDate(date)) {
    errors.push('date must be a valid date in YYYY-MM-DD format');
    return errors;
  }
  if (isSunday(date)) {
    errors.push('Sundays are a standard holiday - no timesheet entry is needed');
    return errors;
  }

  if (!Array.isArray(entries)) {
    errors.push('entries must be an array');
    return errors;
  }

  const seen = new Set();
  entries.forEach((entry, index) => {
    const label = `Row ${index + 1}`;

    if (!entry || typeof entry !== 'object' || !entry.employeeId) {
      errors.push(`${label}: employeeId is required`);
      return;
    }
    if (seen.has(entry.employeeId)) {
      errors.push(`${label}: duplicate entry for employee ${entry.employeeId}`);
    }
    seen.add(entry.employeeId);

    if (!STATUSES.includes(entry.status)) {
      errors.push(`${label}: status must be one of ${STATUSES.join(', ')}`);
    }

    const otHours = entry.otHours === undefined || entry.otHours === '' ? 0 : Number(entry.otHours);
    if (!Number.isFinite(otHours) || otHours < 0) {
      errors.push(`${label}: otHours must be a number of 0 or more`);
    } else if (entry.status !== 'present' && otHours > 0) {
      errors.push(`${label}: otHours can only be entered on a present day`);
    }
  });

  return errors;
};

module.exports = {
  STATUSES,
  isIsoDate,
  isSunday,
  validateDayEntries
};
