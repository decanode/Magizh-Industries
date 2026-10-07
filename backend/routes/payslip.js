const express = require('express');
const router = express.Router();
const payslipController = require('../controllers/payslip');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Payslips are admin only
router.use(authenticate, adminOnly);

router.get('/preview', payslipController.preview);
router.post('/', payslipController.create);
router.get('/', payslipController.list);
router.get('/:id', payslipController.getById);
router.get('/:id/pdf', payslipController.downloadPdf);
router.post('/:id/void', payslipController.voidPayslip);

module.exports = router;
