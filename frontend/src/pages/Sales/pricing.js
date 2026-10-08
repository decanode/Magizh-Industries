// Live preview of an order's amounts while it is being typed. The server recalculates everything when the order
// is saved (same rules, in whole paise), so this only has to match, never decide.
const COMPANY_STATE = 'tamil nadu';

export const taxTypeForState = (state) => (String(state || '').trim().toLowerCase() === COMPANY_STATE ? 'INTRA' : 'INTER');

export const gstRateOf = (material) => {
  const igst = parseFloat(material?.igst);
  if (igst > 0) return igst;
  return (parseFloat(material?.cgst) || 0) + (parseFloat(material?.sgst) || 0);
};

export const previewTotals = (lines, taxType) => {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  lines.forEach(({ material, quantity, unitPrice }) => {
    const taxable = Math.round((Number(quantity) || 0) * Math.round((Number(unitPrice) || 0) * 100));
    const rate = gstRateOf(material);
    subtotal += taxable;
    if (taxType === 'INTER') {
      igst += Math.round((taxable * rate) / 100);
    } else {
      cgst += Math.round((taxable * rate) / 200);
      sgst += Math.round((taxable * rate) / 200);
    }
  });

  const grandTotal = subtotal + cgst + sgst + igst;
  return {
    subtotal: subtotal / 100,
    cgst: cgst / 100,
    sgst: sgst / 100,
    igst: igst / 100,
    grandTotal: grandTotal / 100
  };
};
