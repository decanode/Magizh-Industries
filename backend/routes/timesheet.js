const express = require('express');
const router = express.Router();
const timesheetController = require('../controllers/timesheet');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Timesheet is admin only
router.use(authenticate, adminOnly);

router.get('/day/:date', timesheetController.getDay);
router.post('/day/:date', timesheetController.saveDay);
router.get('/summary', timesheetController.getMonthlySummary);

module.exports = router;
