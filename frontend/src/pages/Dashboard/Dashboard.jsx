import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { timesheetApi } from '../Timesheet/timesheetApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Timesheet/Timesheet.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const now = new Date();

const Dashboard = ({ isAdmin = false }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    timesheetApi(`/summary?year=${year}&month=${month}`)
      .then((data) => {
        setSummary(data);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  const allLeaveEntries =
    summary?.employees.flatMap((employee) =>
      employee.leaveEntries.map((entry) => ({ ...entry, employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}` }))
    ) || [];
  allLeaveEntries.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Dashboard" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <select className="ts-month-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
            <input
              type="number"
              className="ts-year-input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : (
            summary && (
              <>
                <div className="ts-stat-row">
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.workingDays}</span>
                    <span className="ts-stat-label">Working days this month</span>
                  </div>
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.totals.presentDays}</span>
                    <span className="ts-stat-label">Total present-days</span>
                  </div>
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.totals.absentDays}</span>
                    <span className="ts-stat-label">Total absent-days</span>
                  </div>
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.totals.leaveDays}</span>
                    <span className="ts-stat-label">Total leave-days</span>
                  </div>
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.totals.workingHours}</span>
                    <span className="ts-stat-label">Total working hours</span>
                  </div>
                  <div className="ts-stat-card">
                    <span className="ts-stat-value">{summary.totals.otHours}</span>
                    <span className="ts-stat-label">Total OT hours</span>
                  </div>
                </div>

                <div className="em-table-wrap">
                  <table className="em-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Leave</th>
                        <th>Working hours</th>
                        <th>OT hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.employees.map((employee) => (
                        <tr key={employee.employeeId}>
                          <td className="em-code">{employee.employeeCode}</td>
                          <td>{`${employee.firstName} ${employee.lastName}`}</td>
                          <td>{employee.presentDays}</td>
                          <td>{employee.absentDays}</td>
                          <td>{employee.leaveDays}</td>
                          <td>{employee.workingHours}</td>
                          <td>{employee.otHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <section className="em-section">
                  <h3>Leave history</h3>
                  {allLeaveEntries.length === 0 ? (
                    <p className="em-muted">No leave recorded this month.</p>
                  ) : (
                    <ul className="ts-leave-list">
                      {allLeaveEntries.map((entry, index) => (
                        <li key={index}>
                          <span className="em-code">{entry.date}</span> — {entry.name} ({entry.employeeCode})
                          {entry.note ? ` — ${entry.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
