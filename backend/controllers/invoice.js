// Tax invoices (admin only for now).
const InvoiceService = require('../services/InvoiceService');
const { SalesOrderError } = require('../services/SalesOrderService');
const { renderTaxInvoice, COPY_LABELS } = require('../utils/documentPdf');

const invoiceService = new InvoiceService();
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const STATUS_FILTERS = ['all', 'Issued', 'Overdue', 'Paid', 'Cancelled'];
const STATUS_CODES = {
  VALIDATION: 400, NOT_FOUND: 404, LOCKED: 409, CONFLICT: 409, ALREADY_INVOICED: 409, COSTING_NOT_CONFIRMED: 409, MISSING_HSN: 409
};

const respondWithError = (res, error, fallbackMessage) => {
  if (error instanceof SalesOrderError) {
    return res.status(STATUS_CODES[error.code] || 400).json({ message: error.message, code: error.code, details: error.details });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage, error: error.message });
};

const actorOf = (req) => ({ email: req.user?.email, firstName: req.user?.firstName });

exports.listInvoices = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    if (!STATUS_FILTERS.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const all = await invoiceService.list({ search: req.query.search || '', status });
    const start = (page - 1) * pageSize;

    res.status(200).json({
      items: all.slice(start, start + pageSize), page, pageSize, total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize))
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to load invoices');
  }
};

exports.getInvoice = async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.status(200).json({ item: invoice });
  } catch (error) {
    respondWithError(res, error, 'Failed to load invoice');
  }
};

exports.createInvoiceFromDelivery = async (req, res) => {
  try {
    const invoice = await invoiceService.createFromDelivery(req.params.deliveryId, req.body || {}, actorOf(req), req.headers['x-idempotency-key']);
    res.status(invoice.replayed ? 200 : 201).json({ message: 'Invoice created successfully', item: invoice });
  } catch (error) {
    respondWithError(res, error, 'Failed to create invoice');
  }
};

exports.cancelInvoice = async (req, res) => {
  try {
    res.status(200).json({ message: 'Invoice cancelled', item: await invoiceService.cancel(req.params.id, req.body?.reason, actorOf(req)) });
  } catch (error) {
    respondWithError(res, error, 'Failed to cancel invoice');
  }
};

// The tax invoice as a PDF. ?copy=original|duplicate|triplicate chooses the label printed on the copy.
exports.getInvoicePdf = async (req, res) => {
  try {
    const copy = req.query.copy || 'original';
    if (!COPY_LABELS[copy]) return res.status(400).json({ message: 'copy must be original, duplicate or triplicate' });

    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const pdf = await renderTaxInvoice(invoice, { copy });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber.replace(/\//g, '-')}.pdf"`,
      'Cache-Control': 'no-store'
    });
    res.status(200).send(pdf);
  } catch (error) {
    respondWithError(res, error, 'Failed to create the invoice PDF');
  }
};
