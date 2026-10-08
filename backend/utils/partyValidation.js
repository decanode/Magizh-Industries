// Customer and supplier masters share the same fields. Code and audit fields are set by the server.
const crypto = require('crypto');

const PARTY_FIELDS = [
  'name', 'contactPerson', 'phone', 'email', 'gstin', 'address', 'city', 'state', 'pincode', 'paymentTermsDays', 'addresses'
];
const ADDRESS_TYPES = ['billing', 'shipping'];
const MAX_ADDRESSES = 20;

// Standard Indian GSTIN format, e.g. 22AAAAA0000A1Z5
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const pickPartyFields = (body = {}) => {
  const picked = {};
  PARTY_FIELDS.forEach((field) => {
    if (body[field] !== undefined) picked[field] = body[field];
  });
  return picked;
};

const normalizePartyFields = (data) => {
  const normalized = { ...data };
  PARTY_FIELDS.forEach((field) => {
    if (typeof normalized[field] === 'string') normalized[field] = normalized[field].trim();
  });
  if (normalized.gstin) normalized.gstin = normalized.gstin.toUpperCase();

  if (Array.isArray(normalized.addresses)) {
    normalized.addresses = normalized.addresses.map((address) => {
      const clean = { id: address.id || crypto.randomUUID() };
      ['type', 'label', 'name', 'gstin', 'line1', 'line2', 'city', 'state', 'pincode'].forEach((field) => {
        clean[field] = typeof address[field] === 'string' ? address[field].trim() : address[field];
      });
      if (clean.gstin) clean.gstin = String(clean.gstin).toUpperCase();
      return clean;
    });
  }
  if (normalized.paymentTermsDays !== undefined && normalized.paymentTermsDays !== '') {
    normalized.paymentTermsDays = Number(normalized.paymentTermsDays);
  }
  return normalized;
};

// Returns a list of messages; empty means valid. On update only the supplied fields are checked.
const validateParty = (data, { partial = false } = {}) => {
  const errors = [];

  if (!partial && isBlank(data.name)) errors.push('name is required');
  if (partial && data.name !== undefined && isBlank(data.name)) errors.push('name cannot be empty');

  if (!isBlank(data.email) && !EMAIL_PATTERN.test(data.email)) errors.push('email is not valid');
  if (!isBlank(data.phone) && !/^[0-9+\-\s()]{7,15}$/.test(data.phone)) errors.push('phone is not valid');
  if (!isBlank(data.gstin) && !GSTIN_PATTERN.test(data.gstin)) errors.push('gstin is not valid');
  if (!isBlank(data.pincode) && !/^[0-9]{6}$/.test(data.pincode)) errors.push('pincode must be 6 digits');

  if (!isBlank(data.paymentTermsDays) && !(Number.isInteger(data.paymentTermsDays) && data.paymentTermsDays >= 0 && data.paymentTermsDays <= 120)) {
    errors.push('paymentTermsDays must be a whole number of days between 0 and 120');
  }

  if (data.addresses !== undefined) {
    if (!Array.isArray(data.addresses) || data.addresses.length > MAX_ADDRESSES) {
      errors.push(`addresses must be a list of at most ${MAX_ADDRESSES}`);
    } else {
      data.addresses.forEach((address, index) => {
        const where = `address ${index + 1}`;
        if (!ADDRESS_TYPES.includes(address.type)) errors.push(`${where}: type must be billing or shipping`);
        if (isBlank(address.line1)) errors.push(`${where}: address line is required`);
        if (isBlank(address.state)) errors.push(`${where}: state is required`);
        if (!isBlank(address.pincode) && !/^[0-9]{6}$/.test(address.pincode)) errors.push(`${where}: pincode must be 6 digits`);
        if (!isBlank(address.gstin) && !GSTIN_PATTERN.test(address.gstin)) errors.push(`${where}: gstin is not valid`);
      });
    }
  }

  return errors;
};

module.exports = { pickPartyFields, normalizePartyFields, validateParty };
