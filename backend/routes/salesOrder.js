const express = require('express');
const router = express.Router();
const controller = require('../controllers/salesOrder');
const deliveryController = require('../controllers/delivery');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Sales is admin only for now; role-based access for other users comes later
router.use(authenticate, adminOnly);

router.get('/', controller.listSalesOrders);
router.post('/', controller.createSalesOrder);
// Fixed paths must come before /:id
router.get('/materials', controller.listSellableMaterials);
router.get('/:id', controller.getSalesOrder);
router.put('/:id', controller.updateSalesOrder);
router.post('/:id/cancel', controller.cancelSalesOrder);
router.post('/:id/close-balance', controller.closeSalesOrderBalance);
router.post('/:orderId/deliveries', deliveryController.createDelivery);

module.exports = router;
