const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderDeliveryChallan, renderTaxInvoice, LAYOUT } = require('../utils/documentPdf');
const { priceLines } = require('../utils/salesOrderPricing');

const customer = { code: '50001', name: 'Test Customer Pvt Ltd', gstin: '33AABCS1624G2ZT' };
const address = { line1: '1 Main Road', line2: '', city: 'Coimbatore', pincode: '641001', state: 'Tamil Nadu' };

const documentWith = (lineCount, extra = {}) => {
  const { lines, totals } = priceLines(
    Array.from({ length: lineCount }, (_, i) => ({
      materialId: `m${i}`, materialCode: `C${i}`, materialName: `Item number ${i + 1} with a reasonably long description`,
      hsnCode: '853710', unit: 'EA', quantity: 2, unitPrice: 1000 + i, gstRate: 18
    })),
    extra.taxType || 'INTRA'
  );
  return { customer, billTo: address, shipTo: { ...address, name: 'Consignee Ltd', gstin: '33AAACV7795C1Z8' }, taxType: 'INTRA', lines, totals, ...extra };
};

const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length;

const challan = (lineCount, extra) => renderDeliveryChallan(documentWith(lineCount, { dcNumber: 'MI/DC-0001/26-27', deliveryDate: '2026-10-06', status: 'Created', ...extra }));
const invoice = (lineCount, extra, options) =>
  renderTaxInvoice(documentWith(lineCount, {
    invoiceNumber: 'MI/INV-039/26-27', invoiceDate: '2026-10-06', dueDate: '2026-11-20', paymentTermsDays: 45, status: 'Issued', ...extra
  }), options);

test('a delivery challan is a one-page PDF for a short order', async () => {
  const pdf = await challan(2);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pageCount(pdf), 1);
});

test('a tax invoice is a one-page PDF for a short order', async () => {
  const pdf = await invoice(2);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pageCount(pdf), 1);
});

test('long item lists continue onto more pages', async () => {
  assert.ok(pageCount(await challan(30)) >= 2);
  assert.ok(pageCount(await invoice(30)) >= 2);
});

test('IGST, cancelled, copy labels, HALB line and a missing logo-less consignee all render', async () => {
  assert.ok((await invoice(3, { taxType: 'INTER' })).length > 1000);
  assert.ok((await invoice(1, { status: 'Cancelled', quotationNumber: 'SYRD976VMCMOL' }, { copy: 'triplicate' })).length > 1000);
  assert.ok((await challan(1, { status: 'Cancelled', shipTo: { ...address } })).length > 1000);
});

test('the items table lines up with the page grid', () => {
  const widths = LAYOUT.COLUMNS.map((column) => column.width);
  const upTo = (count) => widths.slice(0, count).reduce((sum, width) => sum + width, 0);
  assert.equal(upTo(widths.length), LAYOUT.CONTENT_WIDTH, 'columns fill the page width exactly');
  assert.equal(upTo(4), LAYOUT.SPLIT, 'bill-to / ship-to split falls after Quantity');
  assert.equal(upTo(5), LAYOUT.LABEL_WIDTH, 'tax summary labels end after Unit Price');
});
