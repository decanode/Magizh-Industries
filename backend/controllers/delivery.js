// Deliveries / delivery challans (admin only for now).
const DeliveryService = require('../services/DeliveryService');
const { SalesOrderError } = require('../services/SalesOrderService');
const { renderDeliveryChallan } = require('../utils/documentPdf');

const deliveryService = new DeliveryService();
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const STATUS_FILTERS = ['all', 'CostingPending', 'CostingConfirmed', 'Invoiced', 'Created', 'Cancelled'];
const STATUS_CODES = { VALIDATION: 400, NOT_FOUND: 404, LOCKED: 409, CONFLICT: 409, OVER_DELIVERY: 409 };

const respondWithError = (res, error, fallbackMessage) => {
  if (error instanceof SalesOrderError) {
    return res.status(STATUS_CODES[error.code] || 400).json({ message: error.message, code: error.code, details: error.details });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage, error: error.message });
};

const actorOf = (req) => ({ email: req.user?.email, firstName: req.user?.firstName });

exports.listDeliveries = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    if (!STATUS_FILTERS.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const all = await deliveryService.list({
      search: req.query.search || '', status, salesOrderId: req.query.salesOrderId || ''
    });
    const start = (page - 1) * pageSize;

    res.status(200).json({
      items: all.slice(start, start + pageSize), page, pageSize, total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize))
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to load deliveries');
  }
};

exports.getDelivery = async (req, res) => {
  try {
    const delivery = await deliveryService.getById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    res.status(200).json({ item: delivery });
  } catch (error) {
    respondWithError(res, error, 'Failed to load delivery');
  }
};

exports.createDelivery = async (req, res) => {
  try {
    const delivery = await deliveryService.create(req.params.orderId, req.body, actorOf(req), req.headers['x-idempotency-key']);
    res.status(delivery.replayed ? 200 : 201).json({ message: 'Delivery created successfully', item: delivery });
  } catch (error) {
    respondWithError(res, error, 'Failed to create delivery');
  }
};

exports.updateDelivery = async (req, res) => {
  try {
    res.status(200).json({ message: 'Delivery updated successfully', item: await deliveryService.update(req.params.id, req.body, actorOf(req)) });
  } catch (error) {
    respondWithError(res, error, 'Failed to update delivery');
  }
};

exports.setCostingConfirmation = async (req, res) => {
  try {
    const delivery = await deliveryService.setCostingConfirmation(req.params.id, req.body?.confirmed === true, req.body?.reference, actorOf(req));
    res.status(200).json({ message: 'Costing confirmation saved', item: delivery });
  } catch (error) {
    respondWithError(res, error, 'Failed to save costing confirmation');
  }
};

exports.cancelDelivery = async (req, res) => {
  try {
    res.status(200).json({ message: 'Delivery cancelled', item: await deliveryService.cancel(req.params.id, req.body?.reason, actorOf(req)) });
  } catch (error) {
    respondWithError(res, error, 'Failed to cancel delivery');
  }
};

// The delivery challan as a PDF, ready to view or print
exports.getDeliveryPdf = async (req, res) => {
  try {
    const delivery = await deliveryService.getById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

    const hsnByMaterial = await deliveryService.currentHsnByMaterial(delivery);
    const pdf = await renderDeliveryChallan(delivery, { hsnByMaterial });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${delivery.dcNumber.replace(/\//g, '-')}.pdf"`,
      'Cache-Control': 'no-store'
    });
    res.status(200).send(pdf);
  } catch (error) {
    respondWithError(res, error, 'Failed to create the delivery challan PDF');
  }
};
