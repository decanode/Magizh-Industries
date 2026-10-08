const express = require('express');
const router = express.Router();
const controller = require('../controllers/delivery');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Admin only for now; role-based access for other users comes later
router.use(authenticate, adminOnly);

router.get('/', controller.listDeliveries);
router.get('/:id', controller.getDelivery);
router.get('/:id/pdf', controller.getDeliveryPdf);
router.put('/:id', controller.updateDelivery);
router.post('/:id/costing', controller.setCostingConfirmation);
router.post('/:id/cancel', controller.cancelDelivery);

module.exports = router;
