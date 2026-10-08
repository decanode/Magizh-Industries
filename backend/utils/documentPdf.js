// Delivery challan and tax invoice PDFs, laid out like the owner's existing Excel formats: boxed grid, company header
// with logo, bill-to / ship-to, items table, tax summary, bank details and terms, signature box.
const PDFDocument = require('pdfkit');
const path = require('path');
const { COMPANY } = require('./companyProfile');
const { amountInWords } = require('./amountInWords');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'company-logo.png');

const MARGIN = 30;
const CONTENT_WIDTH = 535;
const PAGE_BOTTOM = 812;
const PADDING = 4;
const FONT = 'Times-Roman';
const FONT_BOLD = 'Times-Bold';

// Items table columns. Their running totals (262 and 331) are also where the bill-to/ship-to split and the
// tax-summary label column fall, so the whole sheet lines up like the Excel original.
const COLUMNS = [
  { key: 'sr', label: 'Sr. No', width: 38 },
  { key: 'product', label: 'Product', width: 116 },
  { key: 'hsn', label: 'HSN/SAC', width: 58 },
  { key: 'quantity', label: 'Quantity', width: 50 },
  { key: 'unitPrice', label: 'Unit Price', width: 69 },
  { key: 'amount', label: 'Amount', width: 120 },
  { key: 'total', label: 'Total', width: 84 }
];
const SPLIT = 262; // end of the Quantity column
const LABEL_WIDTH = 331; // end of the Unit Price column

const COPY_LABELS = {
  original: 'Original for Recipient',
  duplicate: 'Duplicate for Transporter',
  triplicate: 'Triplicate for Supplier'
};

// --- formatting ----------------------------------------------------------------------------------------

// The owner's sheets show plain numbers (689.4, 9038.8, 288000), so trailing zeros are dropped
const num = (value) => String(Number(Number(value).toFixed(2)));

const pad2 = (n) => String(n).padStart(2, '0');
// 2026-10-06 -> 06/10/2026 (challan) or 06-10-26 (invoice)
const dateLong = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
const dateShort = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}-${m}-${y.slice(2)}`; };

const quantityText = (line) => `${num(line.quantity)}${line.unit && line.unit !== 'EA' ? ` ${line.unit}` : ''}`;

// A consignee with its own name uses its own GSTIN (possibly none); otherwise the customer's details apply
const partyName = (address, customer) => address.name || customer.name;
const partyGstin = (address, customer) => (address.name ? address.gstin || '' : address.gstin || customer.gstin || '');
const addressLines = (address) => [
  address.line1,
  address.line2,
  [address.city, address.pincode].filter(Boolean).join(' - '),
  address.state
].filter(Boolean);

// --- drawing primitives --------------------------------------------------------------------------------

const box = (doc, x, y, w, h) => doc.lineWidth(0.7).strokeColor('#000000').rect(x, y, w, h).stroke();

const textHeight = (doc, text, width, { bold = false, size = 9.5 } = {}) => {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(size);
  return doc.heightOfString(String(text), { width: width - 2 * PADDING, lineGap: 1 });
};

// Draws text inside a cell. valign: 'middle' (default) or 'top'.
const write = (doc, text, x, y, w, h, { align = 'center', bold = false, size = 9.5, valign = 'middle' } = {}) => {
  if (text === undefined || text === null || text === '') return;
  const th = textHeight(doc, text, w, { bold, size });
  const ty = valign === 'top' ? y + 5 : y + Math.max(2, (h - th) / 2);
  doc.fillColor('#000000').font(bold ? FONT_BOLD : FONT).fontSize(size)
    .text(String(text), x + PADDING, ty, { width: w - 2 * PADDING, align, lineGap: 1 });
};

const cell = (doc, x, y, w, h, text, options) => {
  box(doc, x, y, w, h);
  write(doc, text, x, y, w, h, options);
};

// A faint diagonal stamp on cancelled documents, drawn under the content on every page
const stamp = (doc, label) => {
  if (!label) return;
  doc.save();
  doc.opacity(0.1).fillColor('#000000').font(FONT_BOLD).fontSize(84);
  doc.rotate(-35, { origin: [297, 420] });
  doc.text(label, 0, 380, { width: 595, align: 'center' });
  doc.restore();
};

const newPage = (doc, state) => {
  doc.addPage();
  stamp(doc, state.stamp);
  return MARGIN;
};

// Company block: logo on the left, name/address/contact centred on the right. Returns the y below it.
const drawHeader = (doc, y) => {
  const height = 118;
  const logoWidth = 160;
  box(doc, MARGIN, y, CONTENT_WIDTH, height);
  doc.moveTo(MARGIN + logoWidth, y).lineTo(MARGIN + logoWidth, y + height).stroke();

  try {
    doc.image(LOGO_PATH, MARGIN + 10, y + 9, { fit: [logoWidth - 20, height - 18], align: 'center', valign: 'center' });
  } catch {
    // A missing logo must never stop a document being produced
  }

  const lines = [
    { text: COMPANY.name, bold: true, size: 12 },
    ...COMPANY.addressLines.map((text) => ({ text, size: 10.5 })),
    { text: `Mobile:${COMPANY.mobile}`, size: 10.5 },
    { text: `Mail Id:${COMPANY.email}`, size: 10.5 },
    { text: `GSTIN: ${COMPANY.gstin}`, bold: true, size: 10.5 }
  ];
  const textX = MARGIN + logoWidth;
  const textWidth = CONTENT_WIDTH - logoWidth;
  const total = lines.reduce((sum, line) => sum + textHeight(doc, line.text, textWidth, line) + 1, 0);
  let cursor = y + Math.max(4, (height - total) / 2);
  lines.forEach((line) => {
    doc.fillColor('#000000').font(line.bold ? FONT_BOLD : FONT).fontSize(line.size)
      .text(line.text, textX + PADDING, cursor, { width: textWidth - 2 * PADDING, align: 'center' });
    cursor = doc.y + 1;
  });

  return y + height;
};

// --- shared sections -----------------------------------------------------------------------------------

const drawItemsHeader = (doc, y) => {
  let x = MARGIN;
  COLUMNS.forEach((column) => {
    cell(doc, x, y, column.width, 22, column.label, { bold: true, size: 10 });
    x += column.width;
  });
  return y + 22;
};

// Rows can run onto further pages; each new page repeats the column headings.
const drawItems = (doc, y, delivery, state, describe) => {
  y = drawItemsHeader(doc, y);

  delivery.lines.forEach((line, index) => {
    const { product, hsn } = describe(line);
    const values = {
      sr: index + 1,
      product,
      hsn,
      quantity: quantityText(line),
      unitPrice: num(line.unitPrice),
      amount: num(line.taxableAmount),
      total: num(line.taxableAmount)
    };
    const rowHeight = Math.max(46, textHeight(doc, product, COLUMNS[1].width) + 16);

    if (y + rowHeight > PAGE_BOTTOM - 40) {
      y = drawItemsHeader(doc, newPage(doc, state));
    }

    let x = MARGIN;
    COLUMNS.forEach((column) => {
      cell(doc, x, y, column.width, rowHeight, values[column.key]);
      x += column.width;
    });
    y += rowHeight;
  });

  return y;
};

// Tax lines for the summary. CGST and SGST are each half of the GST rate; the percentage is only printed when
// every item uses the same rate.
const taxRows = (document) => {
  const rates = [...new Set(document.lines.map((line) => line.gstRate))];
  const label = (name, divisor) => (rates.length === 1 ? `${name} Tax(${num(rates[0] / divisor)}%)` : `${name} Tax`);
  const rows = [{ label: 'Taxable Amount', value: document.totals.subtotal }];
  if (document.taxType === 'INTER') {
    rows.push({ label: label('IGST', 1), value: document.totals.igst });
  } else {
    rows.push({ label: label('CGST', 2), value: document.totals.cgst });
    rows.push({ label: label('SGST', 2), value: document.totals.sgst });
  }
  rows.push({ label: 'Total Amount after Tax', value: document.totals.grandTotal, bold: true });
  return rows;
};

const drawSignature = (doc, y) => {
  const height = 100;
  cell(doc, MARGIN, y, SPLIT, height, 'Customer Signature & Seal', { align: 'left', valign: 'top', size: 10 });
  box(doc, MARGIN + SPLIT, y, CONTENT_WIDTH - SPLIT, height);
  write(doc, 'Certified that the particulars given above are true and correct.', MARGIN + SPLIT, y, CONTENT_WIDTH - SPLIT, height, { align: 'left', valign: 'top', size: 10 });
  write(doc, 'For Magizh Industries', MARGIN + SPLIT, y + 62, CONTENT_WIDTH - SPLIT, 20, { size: 10.5 });
  return y + height;
};

const ensureRoom = (doc, y, needed, state) => (y + needed > PAGE_BOTTOM ? newPage(doc, state) : y);

// --- delivery challan ----------------------------------------------------------------------------------

const buildChallan = (doc, delivery, { hsnByMaterial = {}, state }) => {
  let y = drawHeader(doc, MARGIN);

  // Title and date
  const titleWidth = 425;
  cell(doc, MARGIN, y, titleWidth, 24, `DELIVERY CHALLAN - ${delivery.dcNumber}`, { bold: true, size: 11 });
  cell(doc, MARGIN + titleWidth, y, CONTENT_WIDTH - titleWidth, 24, dateLong(delivery.deliveryDate), { bold: true, size: 11 });
  y += 24;

  // Bill to | Ship to
  cell(doc, MARGIN, y, SPLIT, 20, 'BILL TO', { bold: true, size: 10.5 });
  cell(doc, MARGIN + SPLIT, y, CONTENT_WIDTH - SPLIT, 20, 'SHIP TO', { bold: true, size: 10.5 });
  y += 20;

  const { customer, billTo, shipTo } = delivery;
  const labelWidth = 62;
  const leftValueWidth = SPLIT - labelWidth;
  const rightWidth = CONTENT_WIDTH - SPLIT;
  const billAddress = addressLines(billTo).join('\n');
  const shipAddress = addressLines(shipTo).join('\n');

  const nameHeight = Math.max(30, textHeight(doc, partyName(billTo, customer), leftValueWidth) + 12, textHeight(doc, partyName(shipTo, customer), rightWidth) + 12);
  const addressHeight = Math.max(64, textHeight(doc, billAddress, leftValueWidth) + 14, textHeight(doc, shipAddress, rightWidth) + 14);
  const gstinHeight = 22;

  [['Name', partyName(billTo, customer), partyName(shipTo, customer), nameHeight],
    ['Address', billAddress, shipAddress, addressHeight],
    ['GSTIN', partyGstin(billTo, customer), partyGstin(shipTo, customer), gstinHeight]].forEach(([label, left, right, height]) => {
    cell(doc, MARGIN, y, labelWidth, height, label, { size: 10 });
    cell(doc, MARGIN + labelWidth, y, leftValueWidth, height, left);
    cell(doc, MARGIN + SPLIT, y, rightWidth, height, right);
    y += height;
  });

  y = drawItems(doc, y, delivery, state, (line) => ({
    product: line.materialName,
    hsn: hsnByMaterial[line.materialId] || line.hsnCode || ''
  }));

  // Tax summary
  y = ensureRoom(doc, y, 4 * 24 + 100, state);
  taxRows(delivery).forEach((row) => {
    const height = row.bold ? 30 : 24;
    cell(doc, MARGIN, y, LABEL_WIDTH, height, row.label, { size: 10 });
    cell(doc, MARGIN + LABEL_WIDTH, y, CONTENT_WIDTH - LABEL_WIDTH, height, num(row.value), { bold: row.bold, size: 10.5 });
    y += height;
  });

  drawSignature(doc, y);
};

// --- tax invoice ---------------------------------------------------------------------------------------

const buildInvoice = (doc, invoice, { copy = 'original', state }) => {
  let y = drawHeader(doc, MARGIN);

  cell(doc, MARGIN, y, CONTENT_WIDTH, 22, 'TAX INVOICE', { bold: true, size: 11.5 });
  y += 22;

  // Customer block (left) and invoice particulars (right)
  const { customer, billTo } = invoice;
  const leftWidth = LABEL_WIDTH;
  const rightWidth = CONTENT_WIDTH - leftWidth;
  const labelWidth = 80;
  const valueWidth = leftWidth - labelWidth;
  const address = addressLines(billTo).join('\n');

  const nameHeight = Math.max(34, textHeight(doc, partyName(billTo, customer), valueWidth) + 12);
  const addressHeight = Math.max(70, textHeight(doc, address, valueWidth) + 14);
  const gstinHeight = 22;
  const supplyHeight = 22;

  [['Name', partyName(billTo, customer), nameHeight],
    ['Address', address, addressHeight],
    ['GSTIN', partyGstin(billTo, customer), gstinHeight],
    ['Place of Supply', billTo.state || '', supplyHeight]].forEach(([label, value, height]) => {
    cell(doc, MARGIN, y, labelWidth, height, label, { size: 10 });
    cell(doc, MARGIN + labelWidth, y, valueWidth, height, value);
    y += height;
  });

  const blockTop = y - (nameHeight + addressHeight + gstinHeight + supplyHeight);
  const rightLabel = 82;
  const rightValue = rightWidth - rightLabel;
  const rightRows = [
    { height: nameHeight, text: COPY_LABELS[copy] || COPY_LABELS.original, bold: true },
    { height: addressHeight / 2, label: 'Invoice No.', text: invoice.invoiceNumber },
    { height: addressHeight / 2, label: 'Invoice Date', text: dateShort(invoice.invoiceDate) },
    { height: gstinHeight + supplyHeight, label: 'PO No.', text: invoice.customerPoNumber || '' }
  ];
  let ry = blockTop;
  rightRows.forEach((row) => {
    if (row.label) {
      cell(doc, MARGIN + leftWidth, ry, rightLabel, row.height, row.label, { size: 10 });
      cell(doc, MARGIN + leftWidth + rightLabel, ry, rightValue, row.height, row.text, { size: 10 });
    } else {
      cell(doc, MARGIN + leftWidth, ry, rightWidth, row.height, row.text, { bold: row.bold, size: 11 });
    }
    ry += row.height;
  });

  y = drawItems(doc, y, invoice, state, (line) => ({ product: line.description || line.materialName, hsn: line.hsnCode }));

  // Amount in words (left) and tax summary (right)
  const rows = taxRows(invoice);
  const rowHeights = rows.map((row, index) => (index === rows.length - 1 ? 36 : index === 0 ? 30 : 24));
  const summaryHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  y = ensureRoom(doc, y, summaryHeight + 20 + 120 + 100, state);

  cell(doc, MARGIN, y, LABEL_WIDTH, 22, 'Total Amount in words', { size: 10 });
  cell(doc, MARGIN, y + 22, LABEL_WIDTH, summaryHeight - 22, amountInWords(invoice.totals.grandTotal), { size: 10 });
  const summaryLabel = 110;
  let sy = y;
  rows.forEach((row, index) => {
    cell(doc, MARGIN + LABEL_WIDTH, sy, summaryLabel, rowHeights[index], row.label, { size: 10 });
    cell(doc, MARGIN + LABEL_WIDTH + summaryLabel, sy, CONTENT_WIDTH - LABEL_WIDTH - summaryLabel, rowHeights[index], num(row.value), { bold: row.bold, size: 10.5 });
    sy += rowHeights[index];
  });
  y += summaryHeight;

  // "HALB" is a fixed label; the value is the customer's quotation number from the order
  if (invoice.quotationNumber) {
    cell(doc, MARGIN, y, CONTENT_WIDTH, 22, `HALB      ${invoice.quotationNumber}`, { align: 'left', bold: true, size: 10 });
    y += 22;
  }

  // Bank details (left) and terms (right)
  const bankWidth = 215;
  const termsWidth = CONTENT_WIDTH - bankWidth;
  const bankRows = [
    ['Bank Name', COMPANY.bank.name],
    ['Branch', COMPANY.bank.branch],
    ['Account No', COMPANY.bank.accountNumber],
    ['IFSC code', COMPANY.bank.ifsc]
  ];
  const termsHeight = 18 + bankRows.length * 20;
  cell(doc, MARGIN, y, bankWidth, 18, 'Bank details', { size: 10 });
  cell(doc, MARGIN + bankWidth, y, termsWidth, 18, 'Terms and Conditions', { size: 10 });
  bankRows.forEach(([label, value], index) => {
    const by = y + 18 + index * 20;
    cell(doc, MARGIN, by, 76, 20, label, { align: 'left', size: 10 });
    cell(doc, MARGIN + 76, by, bankWidth - 76, 20, value, { align: 'left', size: 10 });
  });
  box(doc, MARGIN + bankWidth, y + 18, termsWidth, termsHeight - 18);
  const termsX = MARGIN + bankWidth + PADDING;
  doc.fillColor('#000000').font(FONT).fontSize(9.5).text(COMPANY.terms.join(' '), termsX, y + 24, { width: termsWidth - 2 * PADDING });
  doc.font(FONT).fontSize(11).text(`Payment Terms : ${invoice.paymentTermsDays} Days`, termsX, y + 44, { width: termsWidth - 2 * PADDING });
  doc.text(`Due Date : ${dateShort(invoice.dueDate)}`, termsX, doc.y + 4, { width: termsWidth - 2 * PADDING });
  y += termsHeight;

  y = ensureRoom(doc, y, 100, state);
  drawSignature(doc, y);
};

// --- entry points --------------------------------------------------------------------------------------

const render = (title, stampLabel, build) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: title, Author: COMPANY.name } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const state = { stamp: stampLabel };
    stamp(doc, stampLabel);
    try {
      build(doc, state);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const renderDeliveryChallan = (delivery, options = {}) =>
  render(`Delivery Challan ${delivery.dcNumber}`, delivery.status === 'Cancelled' ? 'CANCELLED' : '', (doc, state) =>
    buildChallan(doc, delivery, { ...options, state })
  );

const renderTaxInvoice = (invoice, options = {}) =>
  render(`Tax Invoice ${invoice.invoiceNumber}`, invoice.status === 'Cancelled' ? 'CANCELLED' : '', (doc, state) =>
    buildInvoice(doc, invoice, { ...options, state })
  );

module.exports = { renderDeliveryChallan, renderTaxInvoice, COPY_LABELS, LAYOUT: { COLUMNS, CONTENT_WIDTH, SPLIT, LABEL_WIDTH } };
