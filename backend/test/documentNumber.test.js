const { test } = require('node:test');
const assert = require('node:assert/strict');
const { financialYearOf, formatDocumentNumber, firstNumberFor } = require('../utils/documentNumber');
const { priceOrder, taxTypeForState } = require('../utils/salesOrderPricing');

test('the financial year runs April to March in India time', () => {
  assert.equal(financialYearOf('2026-04-01T00:00:00+05:30'), '26-27');
  assert.equal(financialYearOf('2027-03-31T23:59:00+05:30'), '26-27');
  assert.equal(financialYearOf('2027-04-01T00:00:00+05:30'), '27-28');
  assert.equal(financialYearOf('2027-01-15T10:00:00+05:30'), '26-27');
});

test('document numbers follow the agreed formats', () => {
  assert.equal(formatDocumentNumber('SO', 1, '26-27'), 'MI/SO-0001/26-27');
  assert.equal(formatDocumentNumber('DC', 12, '26-27'), 'MI/DC-0012/26-27');
  assert.equal(formatDocumentNumber('INV', 39, '26-27'), 'MI/INV-039/26-27');
  assert.equal(formatDocumentNumber('INV', 100, '27-28'), 'MI/INV-100/27-28');
});

test('tax type follows the bill-to state', () => {
  assert.equal(taxTypeForState('Tamil Nadu'), 'INTRA');
  assert.equal(taxTypeForState(' tamil nadu '), 'INTRA');
  assert.equal(taxTypeForState('Kerala'), 'INTER');
});

test('pricing never mixes IGST with CGST/SGST and keeps the total exact to the paisa', () => {
  const material = { id: 'm', materialCode: '1', materialName: 'X', cgst: '9', sgst: '9', igst: '' };
  const intra = priceOrder([{ material, quantity: 3, unitPrice: 333.33 }], 'INTRA').totals;
  assert.equal(intra.igst, 0);
  assert.equal(intra.cgst, intra.sgst);
  assert.equal(intra.grandTotal, 1179.99);
  assert.equal(intra.roundOff, undefined);

  const inter = priceOrder([{ material, quantity: 3, unitPrice: 333.33 }], 'INTER').totals;
  assert.equal(inter.cgst + inter.sgst, 0);
  assert.equal(inter.igst, 180);
  assert.equal(inter.grandTotal, 1179.99);
});

test('invoices continue from 039 in 26-27 only; every other series starts at 1', () => {
  assert.equal(firstNumberFor('INV', '26-27'), 39);
  assert.equal(firstNumberFor('INV', '27-28'), 1);
  assert.equal(firstNumberFor('SO', '26-27'), 1);
  assert.equal(firstNumberFor('DC', '26-27'), 1);
});
