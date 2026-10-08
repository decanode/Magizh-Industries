// "Nine Thousand and Thirty Eight Rupees Eighty Paise only" - Indian grouping (thousand, lakh, crore), the way the
// owner's invoices write the total.
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const belowHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);

const belowThousand = (n) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? `${hundreds ? 'and ' : ''}${belowHundred(rest)}` : ''].filter(Boolean).join(' ');
};

const wholeNumberInWords = (n) => {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts = [];
  if (crore) parts.push(`${wholeNumberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  // "and" joins a closing tens/units (or hundreds) group to the bigger groups before it
  if (rest) parts.push(parts.length && rest < 100 ? `and ${belowThousand(rest)}` : belowThousand(rest));
  return parts.join(' ');
};

const amountInWords = (amount) => {
  const totalPaise = Math.round(Number(amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  return `${wholeNumberInWords(rupees)} Rupees${paise ? ` ${belowHundred(paise)} Paise` : ''} only`;
};

module.exports = { amountInWords };
