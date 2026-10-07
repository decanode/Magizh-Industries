const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickEmployeeFields, normalizeEmployeeFields, validateEmployee } = require('../utils/employeeValidation');

const validEmployee = {
  firstName: 'Ravi',
  lastName: 'Kumar',
  designation: 'Supervisor',
  dateOfJoining: '2025-04-01',
  fixedMonthlySalary: 15000
};

test('a complete employee passes validation', () => {
  assert.deepEqual(validateEmployee(validEmployee), []);
});

test('required fields are reported when missing', () => {
  const errors = validateEmployee({});
  assert.ok(errors.includes('firstName is required'));
  assert.ok(errors.includes('lastName is required'));
  assert.ok(errors.includes('designation is required'));
  assert.ok(errors.includes('dateOfJoining is required'));
  assert.ok(errors.includes('fixedMonthlySalary is required'));
});

test('partial updates do not require the required fields', () => {
  assert.deepEqual(validateEmployee({ designation: 'Manager' }, { partial: true }), []);
});

test('fixedMonthlySalary must be a positive number', () => {
  assert.ok(validateEmployee({ ...validEmployee, fixedMonthlySalary: 0 }).some((e) => e.includes('fixedMonthlySalary')));
  assert.ok(validateEmployee({ ...validEmployee, fixedMonthlySalary: -100 }).some((e) => e.includes('fixedMonthlySalary')));
  assert.deepEqual(validateEmployee({ ...validEmployee, fixedMonthlySalary: '15000' }), []);
});

test('optional fields are validated when present', () => {
  assert.deepEqual(
    validateEmployee({ ...validEmployee, email: 'not-an-email', phone: '12345', dob: '1990-02-30', status: 'retired' }),
    [
      'email is invalid',
      'phone must be 10 digits',
      'dob must be a valid date in YYYY-MM-DD format',
      'status must be active or inactive'
    ]
  );
});

test('empty optional fields are accepted', () => {
  assert.deepEqual(validateEmployee({ ...validEmployee, email: '', phone: '', dob: '' }), []);
});

test('aadhaar must be 12 digits, dashes and spaces allowed on input', () => {
  assert.deepEqual(validateEmployee({ ...validEmployee, aadhaar: '3456-6546-9879' }), []);
  assert.ok(validateEmployee({ ...validEmployee, aadhaar: '12345' }).some((e) => e.includes('aadhaar')));
});

test('pan must match the standard format', () => {
  assert.deepEqual(validateEmployee({ ...validEmployee, pan: 'JHBHS6545W' }), []);
  assert.deepEqual(validateEmployee({ ...validEmployee, pan: 'jhbhs6545w' }), []); // case-insensitive on input
  assert.ok(validateEmployee({ ...validEmployee, pan: 'NOTAPAN' }).some((e) => e.includes('pan')));
});

test('pickEmployeeFields drops fields the API must not accept', () => {
  const picked = pickEmployeeFields({
    ...validEmployee,
    employeeCode: '999999',
    status: 'inactive',
    exitReason: 'spoofed',
    createdBy: 'someone-else',
    role: 'admin'
  });
  assert.deepEqual(
    Object.keys(picked).sort(),
    ['dateOfJoining', 'designation', 'firstName', 'fixedMonthlySalary', 'lastName'].sort()
  );
});

test('normalize uppercases PAN and strips aadhaar formatting', () => {
  const normalized = normalizeEmployeeFields({ pan: 'jhbhs6545w', aadhaar: '3456-6546-9879' });
  assert.equal(normalized.pan, 'JHBHS6545W');
  assert.equal(normalized.aadhaar, '345665469879');
});

test('normalize leaves blank PAN and aadhaar untouched', () => {
  const normalized = normalizeEmployeeFields({ pan: '', aadhaar: undefined });
  assert.equal(normalized.pan, '');
  assert.equal(normalized.aadhaar, undefined);
});
