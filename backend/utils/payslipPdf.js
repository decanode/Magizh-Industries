// Renders a stored payslip snapshot into a PDF, mirroring the owner's sample payslip layout.
// Aadhaar never appears here (confirmed by the owner) - only what's in the snapshot is used, and the
// snapshot never carries Aadhaar (see controllers/payslip.js employeeSnapshotFields).
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'company-logo.png');

// Pulled directly from the sample payslip the owner sent. Change here if any of these are wrong.
const COMPANY = {
  name: 'MAGIZH INDUSTRIES',
  addressLines: [
    '568/A5A, Zion Nagar, Madukarai, Podanur,',
    'Malumichampatty, Coimbatore - 641023.'
  ],
  gstin: '33BQGPA3444M1ZZ',
  mobile: '+91 9524442377',
  website: 'www.magizhindustries.in',
  email: 'arul@magizhindustries.in'
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const BORDER = '#999999';
const rupees = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

const renderPayslipPdf = (payslip) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const rowH = 20;

    // --- Header: logo + company details, centered in the space beside the logo ---
    const headerTop = doc.y;
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, left, headerTop, { width: 64 });
    }
    const textX = left + 78;
    const textW = width - 78;
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#1e3a5f')
      .text(COMPANY.name, textX, headerTop, { width: textW, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
    COMPANY.addressLines.forEach((line) => doc.text(line, textX, doc.y, { width: textW, align: 'center' }));
    doc.text(`GSTIN : ${COMPANY.gstin}`, textX, doc.y, { width: textW, align: 'center' });
    doc.text(`Mobile :${COMPANY.mobile}`, textX, doc.y, { width: textW, align: 'center' });
    doc.text(`Website: ${COMPANY.website}`, textX, doc.y, { width: textW, align: 'center' });
    doc.text(`Email: ${COMPANY.email}`, textX, doc.y, { width: textW, align: 'center' });

    let y = Math.max(doc.y, headerTop + 64) + 14;
    doc.fillColor('#000000');

    // --- Title bar ---
    const drawBar = (text, barY) => {
      doc.rect(left, barY, width, rowH).stroke(BORDER);
      doc.font('Helvetica-Bold').fontSize(10).text(text, left, barY + 5, { width, align: 'center' });
    };
    drawBar(`Payslip for ${MONTH_NAMES[payslip.month - 1]}-${payslip.year}`, y);
    y += rowH + 12;

    // --- Employee info grid: 3 rows of label/value pairs, two columns ---
    const colW = width / 2;
    const labelOffset = 6;
    const valueOffset = 115;
    const drawInfoRow = (label1, value1, label2, value2) => {
      doc.rect(left, y, colW, rowH).stroke(BORDER);
      doc.rect(left + colW, y, colW, rowH).stroke(BORDER);
      doc.font('Helvetica-Bold').fontSize(9).text(label1, left + labelOffset, y + 5);
      doc.font('Helvetica').fontSize(9).text(value1, left + valueOffset, y + 5, { width: colW - valueOffset - 6 });
      doc.font('Helvetica-Bold').fontSize(9).text(label2, left + colW + labelOffset, y + 5);
      doc.font('Helvetica').fontSize(9)
        .text(value2, left + colW + valueOffset, y + 5, { width: colW - valueOffset - 6 });
      y += rowH;
    };
    drawInfoRow('Employee Name', `${payslip.firstName} ${payslip.lastName}`, 'PF Account', payslip.pfAccountNumber || '-');
    drawInfoRow('Employee ID', payslip.employeeCode, 'Employee PAN', payslip.pan || '-');
    drawInfoRow('Department', payslip.department || '-', 'D.O.J', payslip.dateOfJoining || '-');
    y += 10;

    // --- No. of working days ---
    doc.rect(left, y, width, rowH).stroke(BORDER);
    doc.font('Helvetica-Bold').fontSize(9).text('No. of working days', left + labelOffset, y + 5);
    doc.font('Helvetica').fontSize(9).text(String(payslip.workingDays), left + valueOffset, y + 5);
    y += rowH + 10;

    // --- Earnings / Deductions table ---
    const labelColW = colW * 0.6;
    const amountColW = colW * 0.4;
    const drawFourCells = (rowY) => {
      doc.rect(left, rowY, labelColW, rowH).stroke(BORDER);
      doc.rect(left + labelColW, rowY, amountColW, rowH).stroke(BORDER);
      doc.rect(left + colW, rowY, labelColW, rowH).stroke(BORDER);
      doc.rect(left + colW + labelColW, rowY, amountColW, rowH).stroke(BORDER);
    };
    const drawMoneyRow = (rowY, label1, amount1, label2, amount2, bold = false) => {
      drawFourCells(rowY);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      if (label1 !== null) doc.text(label1, left + labelOffset, rowY + 5, { width: labelColW - 10 });
      if (amount1 !== null) {
        doc.text(amount1, left + labelColW + 4, rowY + 5, { width: amountColW - 10, align: 'right' });
      }
      if (label2 !== null) doc.text(label2, left + colW + labelOffset, rowY + 5, { width: labelColW - 10 });
      if (amount2 !== null) {
        doc.text(amount2, left + colW + labelColW + 4, rowY + 5, { width: amountColW - 10, align: 'right' });
      }
    };

    drawMoneyRow(y, 'Earnings', 'Amount', 'Deductions', 'Amount', true);
    y += rowH;

    const maxRows = Math.max(payslip.earnings.length, payslip.deductions.length);
    for (let i = 0; i < maxRows; i += 1) {
      const earning = payslip.earnings[i];
      const deduction = payslip.deductions[i];
      drawMoneyRow(
        y,
        earning ? earning.name : null,
        earning ? rupees(earning.amount) : null,
        deduction ? deduction.name : null,
        deduction ? rupees(deduction.amount) : null
      );
      y += rowH;
    }

    drawMoneyRow(y, 'Total Earnings', rupees(payslip.totalEarnings), 'Total Deductions', rupees(payslip.totalDeductions), true);
    y += rowH;
    drawMoneyRow(
      y,
      'Employer contribution to PF',
      rupees(payslip.employerPfContribution),
      'Net Salary',
      rupees(payslip.netSalary),
      true
    );
    y += rowH + 20;

    if (payslip.status === 'voided') {
      doc.save();
      doc.font('Helvetica-Bold').fontSize(80).fillColor('red').opacity(0.25)
        .text('VOID', 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center' });
      doc.restore();
    }

    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#777777')
      .text('This is a system-generated payslip.', left, doc.page.height - doc.page.margins.bottom - 15, {
        width,
        align: 'center'
      });

    doc.end();
  });

module.exports = { renderPayslipPdf, COMPANY };
