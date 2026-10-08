// Sales order maintenance (admin only for now).
const SalesOrderService = require('../services/SalesOrderService');
const { SalesOrderError } = SalesOrderService;

const salesOrderService = new SalesOrderService();
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const STATUS_FILTERS = ['all', 'Open', 'In Delivery', 'Delivered', 'Cancelled'];

const STATUS_CODES = { VALIDATION: 400, NOT_FOUND: 404, LOCKED: 409, CONFLICT: 409, INSUFFICIENT_STOCK: 409 };

// Maps the service's business errors to HTTP responses; anything else is a real failure.
const respondWithError = (res, error, fallbackMessage) => {
  if (error instanceof SalesOrderError) {
    return res.status(STATUS_CODES[error.code] || 400).json({ message: error.message, code: error.code, details: error.details });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage, error: error.message });
};

const actorOf = (req) => ({ email: req.user?.email, firstName: req.user?.firstName });

exports.listSalesOrders = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    if (!STATUS_FILTERS.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const all = await salesOrderService.list({ search: req.query.search || '', status });
    const start = (page - 1) * pageSize;

    res.status(200).json({
      items: all.slice(start, start + pageSize),
      page,
      pageSize,
      total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize))
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to load sales orders');
  }
};

exports.getSalesOrder = async (req, res) => {
  try {
    const order = await salesOrderService.getById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Sales order not found' });
    res.status(200).json({ item: order });
  } catch (error) {
    respondWithError(res, error, 'Failed to load sales order');
  }
};

exports.listSellableMaterials = async (req, res) => {
  try {
    res.status(200).json({ items: await salesOrderService.listSellableMaterials() });
  } catch (error) {
    respondWithError(res, error, 'Failed to load materials');
  }
};

exports.createSalesOrder = async (req, res) => {
  try {
    const order = await salesOrderService.create(req.body, actorOf(req), req.headers['x-idempotency-key']);
    res.status(order.replayed ? 200 : 201).json({ message: 'Sales order created successfully', item: order });
  } catch (error) {
    respondWithError(res, error, 'Failed to create sales order');
  }
};

exports.updateSalesOrder = async (req, res) => {
  try {
    const order = await salesOrderService.update(req.params.id, req.body, actorOf(req));
    res.status(200).json({ message: 'Sales order updated successfully', item: order });
  } catch (error) {
    respondWithError(res, error, 'Failed to update sales order');
  }
};

exports.cancelSalesOrder = async (req, res) => {
  try {
    const order = await salesOrderService.cancel(req.params.id, req.body?.reason, actorOf(req));
    res.status(200).json({ message: 'Sales order cancelled', item: order });
  } catch (error) {
    respondWithError(res, error, 'Failed to cancel sales order');
  }
};

exports.closeSalesOrderBalance = async (req, res) => {
  try {
    const order = await salesOrderService.closeShort(req.params.id, req.body?.reason, actorOf(req));
    res.status(200).json({ message: 'Undelivered balance closed', item: order });
  } catch (error) {
    respondWithError(res, error, 'Failed to close the undelivered balance');
  }
};
