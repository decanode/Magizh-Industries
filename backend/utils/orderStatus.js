// Where an order stands, worked out from how much of each line has been delivered. Cancelled is set explicitly and
// is never derived.
const EPSILON = 1e-9;

const deriveOrderStatus = (lines) => {
  const delivered = lines.map((line) => line.deliveredQty || 0);
  if (delivered.every((quantity) => quantity <= EPSILON)) return 'Open';
  if (lines.every((line, index) => delivered[index] >= line.quantity - EPSILON)) return 'Delivered';
  return 'In Delivery';
};

module.exports = { deriveOrderStatus };
