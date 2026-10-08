const { test } = require('node:test');
const assert = require('node:assert/strict');
const { amountInWords } = require('../utils/amountInWords');

test('writes amounts the way the owner\'s invoices do', () => {
  assert.equal(amountInWords(9038.8), 'Nine Thousand and Thirty Eight Rupees Eighty Paise only');
  assert.equal(amountInWords(339840), 'Three Lakh Thirty Nine Thousand Eight Hundred and Forty Rupees only');
  assert.equal(amountInWords(288000), 'Two Lakh Eighty Eight Thousand Rupees only');
});

test('handles hundreds, teens, crores and paise only', () => {
  assert.equal(amountInWords(100), 'One Hundred Rupees only');
  assert.equal(amountInWords(105), 'One Hundred and Five Rupees only');
  assert.equal(amountInWords(12), 'Twelve Rupees only');
  assert.equal(amountInWords(10000000), 'One Crore Rupees only');
  assert.equal(amountInWords(123456789.05), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred and Eighty Nine Rupees Five Paise only');
  assert.equal(amountInWords(0.5), 'Zero Rupees Fifty Paise only');
  assert.equal(amountInWords(1179.99), 'One Thousand One Hundred and Seventy Nine Rupees Ninety Nine Paise only');
});
