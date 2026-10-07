// Only these fields can be written by the API through create/update. Employee code, exit fields and audit
// fields are set by the server (exit fields only through the deactivate/reactivate actions).
const EMPLOYEE_FIELDS = [
  'firstName',
  'lastName',
  'fatherName',
  'dob',
  'email',
  'phone',
  'designation',
  'department',
  'dateOfJoining',
  'fixedMonthlySalary',
  'aadhaar',
  'pan',
  'bankName',
  'bankAccountNumber',
  'pfAccountNumber'
];

const REQUIRED_FIELDS = ['firstName', 'lastName', 'designation', 'dateOfJoining', 'fixedMonthlySalary'];
const STATUSES = ['active', 'inactive'];

// Standard Indian PAN format, e.g. ABCDE1234F
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(String(value));
};

const normalizeAadhaar = (value) => String(value).replace(/[\s-]/g, '');

const pickEmployeeFields = (body = {}) => {
  const picked = {};
  EMPLOYEE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) picked[field] = body[field];
  });
  return picked;
};

// PAN is uppercased and Aadhaar's spaces/dashes are stripped, so they're stored consistently.
const normalizeEmployeeFields = (data) => {
  const normalized = { ...data };
  if (!isBlank(normalized.pan)) normalized.pan = String(normalized.pan).toUpperCase().trim();
  if (!isBlank(normalized.aadhaar)) normalized.aadhaar = normalizeAadhaar(normalized.aadhaar);
  return normalized;
};

// Returns a list of error messages. An empty list means the data is valid.
// partial: true skips the required-field checks, for updates that change only some fields.
const validateEmployee = (data, { partial = false } = {}) => {
  const errors = [];

  if (!partial) {
    REQUIRED_FIELDS.forEach((field) => {
      if (isBlank(data[field])) errors.push(`${field} is required`);
    });
  }

  if (!isBlank(data.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
    errors.push('email is invalid');
  }

  if (!isBlank(data.phone) && !/^\d{10}$/.test(String(data.phone))) {
    errors.push('phone must be 10 digits');
  }

  if (!isBlank(data.dob) && !isIsoDate(data.dob)) {
    errors.push('dob must be a valid date in YYYY-MM-DD format');
  }

  if (!isBlank(data.dateOfJoining) && !isIsoDate(data.dateOfJoining)) {
    errors.push('dateOfJoining must be a valid date in YYYY-MM-DD format');
  }

  if (data.status !== undefined && !STATUSES.includes(data.status)) {
    errors.push('status must be active or inactive');
  }

  if (data.fixedMonthlySalary !== undefined) {
    const salary = Number(data.fixedMonthlySalary);
    if (!Number.isFinite(salary) || salary <= 0) {
      errors.push('fixedMonthlySalary must be a number greater than 0');
    }
  }

  if (!isBlank(data.aadhaar) && !/^\d{12}$/.test(normalizeAadhaar(data.aadhaar))) {
    errors.push('aadhaar must be 12 digits');
  }

  if (!isBlank(data.pan) && !PAN_PATTERN.test(String(data.pan).toUpperCase())) {
    errors.push('pan must be in the standard format, e.g. ABCDE1234F');
  }

  return errors;
};

module.exports = {
  EMPLOYEE_FIELDS,
  pickEmployeeFields,
  normalizeEmployeeFields,
  validateEmployee
};
