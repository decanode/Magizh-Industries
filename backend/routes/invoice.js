const express = require('express');
const router = express.Router();
const controller = require('../controllers/invoice');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Admin only for now; role-based access for other users comes later
router.use(authenticate, adminOnly);

router.get('/', controller.listInvoices);
router.post('/from-delivery/:deliveryId', controller.createInvoiceFromDelivery);
router.get('/:id', controller.getInvoice);
router.get('/:id/pdf', controller.getInvoicePdf);
router.post('/:id/cancel', controller.cancelInvoice);

module.exports = router;
