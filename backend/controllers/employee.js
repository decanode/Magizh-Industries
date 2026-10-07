// Employee maintenance (admin only): list, create, view, update, and mark an employee as left or rejoined.
const EmployeeService = require('../services/EmployeeService');
const { pickEmployeeFields, normalizeEmployeeFields, validateEmployee } = require('../utils/employeeValidation');

const employeeService = new EmployeeService();
const STATUS_FILTERS = ['all', 'active', 'inactive'];
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

exports.listEmployees = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    if (!STATUS_FILTERS.includes(status)) {
      return res.status(400).json({ message: 'status must be all, active or inactive' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));

    const all = await employeeService.list({ search: req.query.search || '', status });
    const start = (page - 1) * pageSize;

    res.status(200).json({
      message: 'Employees retrieved successfully',
      employees: all.slice(start, start + pageSize),
      page,
      pageSize,
      total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize))
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load employees', error: error.message });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await employeeService.getById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee retrieved successfully', employee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load employee', error: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const data = normalizeEmployeeFields(pickEmployeeFields(req.body));
    const errors = validateEmployee(data);
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const employee = await employeeService.create(data, req.user.userId);

    res.status(201).json({ message: 'Employee created successfully', employee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create employee', error: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const changes = normalizeEmployeeFields(pickEmployeeFields(req.body));
    const errors = validateEmployee(changes, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const employee = await employeeService.update(req.params.id, changes, req.user.userId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee updated successfully', employee });
  } catch (error) {
    if (error.code === 'EMPLOYEE_INACTIVE') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update employee', error: error.message });
  }
};

// Marks the employee as having left the company. The record is kept, never deleted.
exports.deactivateEmployee = async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'A reason for leaving is required' });
    }

    const employee = await employeeService.deactivate(req.params.id, req.user.userId, reason);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee marked as left', employee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to deactivate employee', error: error.message });
  }
};

// Rejoining: clears the exit fields and re-allows edits.
exports.reactivateEmployee = async (req, res) => {
  try {
    const employee = await employeeService.reactivate(req.params.id, req.user.userId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee reactivated', employee });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reactivate employee', error: error.message });
  }
};
