// Payslips (admin only): preview auto-pulls attendance from the Timesheet and runs the payroll formula;
// every number in that preview can be corrected before it's saved as a locked snapshot.
const PayslipService = require('../services/PayslipService');
const EmployeeService = require('../services/EmployeeService');
const TimesheetService = require('../services/TimesheetService');
const { computeMonthlyPay, getWorkingDaysInMonth } = require('../utils/payroll');
const { validatePayslipInput } = require('../utils/payslipValidation');
const { renderPayslipPdf } = require('../utils/payslipPdf');

const payslipService = new PayslipService();
const employeeService = new EmployeeService();
const timesheetService = new TimesheetService();

// Fields frozen onto every payslip snapshot, taken from the employee record at generation time.
const employeeSnapshotFields = (employee) => ({
  employeeId: employee.id,
  employeeCode: employee.employeeCode,
  firstName: employee.firstName,
  lastName: employee.lastName,
  designation: employee.designation,
  department: employee.department,
  dateOfJoining: employee.dateOfJoining,
  pan: employee.pan || '',
  pfAccountNumber: employee.pfAccountNumber || ''
  // Aadhaar is intentionally excluded - it never appears on the payslip.
});

// GET /api/payslips/preview?employeeId=&year=&month= - read-only, nothing is saved.
exports.preview = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!employeeId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: 'employeeId, year and month (1-12) are required' });
    }

    const employee = await employeeService.getById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const workingDays = getWorkingDaysInMonth(year, month);
    const summary = await timesheetService.getMonthlySummary(year, month);
    const attendance = summary[employeeId] || { presentDays: 0, absentDays: 0, leaveDays: 0, otHours: 0 };
    const daysLogged = attendance.presentDays + attendance.absentDays + attendance.leaveDays;

    const pay = computeMonthlyPay({
      fixedMonthlySalary: employee.fixedMonthlySalary,
      year,
      month,
      daysPresent: attendance.presentDays,
      otHours: attendance.otHours
    });

    const existing = await payslipService.getForEmployeeMonth(employeeId, year, month);

    res.status(200).json({
      ...employeeSnapshotFields(employee),
      fixedMonthlySalary: employee.fixedMonthlySalary,
      year,
      month,
      workingDays,
      daysPresent: attendance.presentDays,
      otHours: attendance.otHours,
      daysLogged,
      timesheetIncomplete: daysLogged < workingDays,
      earnings: pay.earnings,
      deductions: pay.deductions,
      totalEarnings: pay.totalEarnings,
      totalDeductions: pay.totalDeductions,
      employerPfContribution: pay.employerPfContribution,
      netSalary: pay.netSalary,
      alreadyExists: Boolean(existing),
      existingStatus: existing?.status || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to build the payslip preview', error: error.message });
  }
};

// POST /api/payslips - saves a payslip. Every number is taken from the request, so the admin's
// corrections to the preview (if any) are exactly what gets stored.
// Only daysPresent and otHours come from the admin. Every amount is computed here, from the formula,
// every time - the client cannot submit an earnings or deductions figure directly.
exports.create = async (req, res) => {
  try {
    const year = parseInt(req.body.year, 10);
    const month = parseInt(req.body.month, 10);
    const payload = { employeeId: req.body.employeeId, year, month, daysPresent: req.body.daysPresent, otHours: req.body.otHours };

    const errors = validatePayslipInput(payload);
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const employee = await employeeService.getById(payload.employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const daysPresent = Number(payload.daysPresent);
    const otHours = Number(payload.otHours);
    const pay = computeMonthlyPay({ fixedMonthlySalary: employee.fixedMonthlySalary, year, month, daysPresent, otHours });

    const payslip = await payslipService.create(
      {
        ...employeeSnapshotFields(employee),
        fixedMonthlySalary: employee.fixedMonthlySalary,
        year,
        month,
        workingDays: pay.workingDays,
        daysPresent,
        otHours,
        earnings: pay.earnings,
        deductions: pay.deductions,
        totalEarnings: pay.totalEarnings,
        totalDeductions: pay.totalDeductions,
        employerPfContribution: pay.employerPfContribution,
        netSalary: pay.netSalary
      },
      req.user.userId
    );

    res.status(201).json({ message: 'Payslip generated successfully', payslip });
  } catch (error) {
    if (error.code === 'PAYSLIP_EXISTS') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to generate the payslip', error: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const month = req.query.month ? parseInt(req.query.month, 10) : undefined;

    const payslips = await payslipService.list({ year, month, employeeId: req.query.employeeId });
    res.status(200).json({ message: 'Payslips retrieved successfully', payslips });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load payslips', error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const payslip = await payslipService.getById(req.params.id);
    if (!payslip) {
      return res.status(404).json({ message: 'Payslip not found' });
    }
    res.status(200).json({ message: 'Payslip retrieved successfully', payslip });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load the payslip', error: error.message });
  }
};

exports.voidPayslip = async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'A reason for voiding is required' });
    }

    const payslip = await payslipService.void(req.params.id, req.user.userId, reason);
    if (!payslip) {
      return res.status(404).json({ message: 'Payslip not found' });
    }
    res.status(200).json({ message: 'Payslip voided', payslip });
  } catch (error) {
    res.status(500).json({ message: 'Failed to void the payslip', error: error.message });
  }
};

exports.downloadPdf = async (req, res) => {
  try {
    const payslip = await payslipService.getById(req.params.id);
    if (!payslip) {
      return res.status(404).json({ message: 'Payslip not found' });
    }

    const pdfBuffer = await renderPayslipPdf(payslip);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Payslip_${payslip.employeeCode}_${payslip.year}-${String(payslip.month).padStart(2, '0')}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate the PDF', error: error.message });
  }
};
