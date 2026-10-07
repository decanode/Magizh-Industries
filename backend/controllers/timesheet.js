// Timesheet (admin only): one day's attendance for every active employee, and a monthly summary for the dashboard.
const TimesheetService = require('../services/TimesheetService');
const EmployeeService = require('../services/EmployeeService');
const { isIsoDate, isSunday, validateDayEntries } = require('../utils/timesheetValidation');
const { getWorkingDaysInMonth } = require('../utils/payroll');

const timesheetService = new TimesheetService();
const employeeService = new EmployeeService();

// GET /api/timesheet/day/:date - every active employee, each paired with their entry for that date (or null).
exports.getDay = async (req, res) => {
  try {
    const { date } = req.params;
    if (!isIsoDate(date)) {
      return res.status(400).json({ message: 'date must be a valid date in YYYY-MM-DD format' });
    }

    if (isSunday(date)) {
      return res.status(200).json({ date, isHoliday: true, employees: [] });
    }

    const [employees, entries] = await Promise.all([
      employeeService.list({ status: 'active' }),
      timesheetService.getDay(date)
    ]);

    res.status(200).json({
      date,
      isHoliday: false,
      employees: employees.map((employee) => ({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        entry: entries[employee.id] || null
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load the timesheet for that day', error: error.message });
  }
};

// POST /api/timesheet/day/:date - overwrites the whole day's entries in one batch.
exports.saveDay = async (req, res) => {
  try {
    const { date } = req.params;
    const entries = req.body.entries;

    const errors = validateDayEntries(date, entries);
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const saved = await timesheetService.saveDay(date, entries, req.user.userId);
    res.status(200).json({ message: 'Timesheet saved', date, entries: saved });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save the timesheet', error: error.message });
  }
};

// GET /api/timesheet/summary?year=&month= - per-employee totals for the month, for the dashboard.
exports.getMonthlySummary = async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: 'year and month (1-12) are required' });
    }

    const [employees, summaryByEmployee] = await Promise.all([
      employeeService.list({ status: 'active' }),
      timesheetService.getMonthlySummary(year, month)
    ]);

    const workingDays = getWorkingDaysInMonth(year, month);
    const empty = { presentDays: 0, absentDays: 0, leaveDays: 0, otHours: 0, leaveEntries: [] };

    const perEmployee = employees.map((employee) => {
      const summary = summaryByEmployee[employee.id] || empty;
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        ...summary,
        workingHours: summary.presentDays * 8
      };
    });

    const totals = perEmployee.reduce(
      (sum, row) => ({
        presentDays: sum.presentDays + row.presentDays,
        absentDays: sum.absentDays + row.absentDays,
        leaveDays: sum.leaveDays + row.leaveDays,
        otHours: sum.otHours + row.otHours,
        workingHours: sum.workingHours + row.workingHours
      }),
      { presentDays: 0, absentDays: 0, leaveDays: 0, otHours: 0, workingHours: 0 }
    );

    res.status(200).json({ year, month, workingDays, employees: perEmployee, totals });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load the monthly summary', error: error.message });
  }
};
