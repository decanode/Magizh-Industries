const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Employee maintenance is admin only
router.use(authenticate, adminOnly);

router.get('/', employeeController.listEmployees);
router.post('/', employeeController.createEmployee);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deactivateEmployee);
router.post('/:id/reactivate', employeeController.reactivateEmployee);

module.exports = router;
