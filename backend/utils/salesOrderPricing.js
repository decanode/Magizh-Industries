// Pure pricing for a sales order. Everything is calculated in whole paise so rounding never drifts, and only
// quantities, prices and the tax type come from the browser - names, units and GST rates always come from the
// material master, and the totals are always recomputed here.
const COMPANY_STATE = 'tamil nadu';

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => paise / 100;

// One tax type per order, never a mix. It follows the bill-to state (the buyer's own state), and the user can
// override it on the order.
const taxTypeForState = (state) => (String(state || '').trim().toLowerCase() === COMPANY_STATE ? 'INTRA' : 'INTER');

// The master stores either IGST or CGST+SGST. Either way the order needs one total GST percentage.
const gstRateOfMaterial = (material) => {
  const igst = parseFloat(material.igst);
  if (igst > 0) return igst;
  const combined = (parseFloat(material.cgst) || 0) + (parseFloat(material.sgst) || 0);
  return combined > 0 ? combined : null;
};

// lines: [{ lineNo?, materialId, materialCode, materialName, catNo, hsnCode, unit, quantity, unitPrice, gstRate }].
// Used for orders and for deliveries, which price from the GST rate recorded on the order line.
const priceLines = (lines, taxType) => {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  const priced = lines.map((line, index) => {
    const rate = line.gstRate;
    const taxable = Math.round(Number(line.quantity) * toPaise(line.unitPrice));

    let lineCgst = 0;
    let lineSgst = 0;
    let lineIgst = 0;
    if (taxType === 'INTER') {
      lineIgst = Math.round((taxable * rate) / 100);
    } else {
      lineCgst = Math.round((taxable * rate) / 200);
      lineSgst = Math.round((taxable * rate) / 200);
    }

    subtotal += taxable;
    cgst += lineCgst;
    sgst += lineSgst;
    igst += lineIgst;

    return {
      lineNo: line.lineNo ?? index + 1,
      materialId: line.materialId,
      materialCode: line.materialCode,
      materialName: line.materialName,
      catNo: line.catNo || '',
      hsnCode: line.hsnCode || '',
      unit: line.unit || 'EA',
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      gstRate: rate,
      taxableAmount: toRupees(taxable),
      cgst: toRupees(lineCgst),
      sgst: toRupees(lineSgst),
      igst: toRupees(lineIgst),
      lineTotal: toRupees(taxable + lineCgst + lineSgst + lineIgst)
    };
  });

  // Totals are exact to the paisa - the invoice is not rounded to the rupee (matches the existing invoice format)
  const grandTotal = subtotal + cgst + sgst + igst;

  return {
    lines: priced,
    totals: {
      subtotal: toRupees(subtotal),
      cgst: toRupees(cgst),
      sgst: toRupees(sgst),
      igst: toRupees(igst),
      grandTotal: toRupees(grandTotal)
    }
  };
};

// lines: [{ material, quantity, unitPrice }] straight from the material master
const priceOrder = (lines, taxType) =>
  priceLines(
    lines.map(({ material, quantity, unitPrice }) => ({
      materialId: material.id,
      materialCode: material.materialCode,
      materialName: material.materialName,
      catNo: material.catNo,
      hsnCode: material.hsnCode,
      unit: material.unit,
      quantity,
      unitPrice,
      gstRate: gstRateOfMaterial(material)
    })),
    taxType
  );

module.exports = { toPaise, taxTypeForState, gstRateOfMaterial, priceLines, priceOrder };
