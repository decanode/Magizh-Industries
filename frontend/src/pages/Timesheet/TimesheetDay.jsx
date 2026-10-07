import { useState, useEffect, useCallback } from 'react';
import { Save } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { timesheetApi, STATUS_OPTIONS, todayIso } from './timesheetApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Timesheet/Timesheet.css';

const toRow = (employee) => ({
  employeeId: employee.employeeId,
  employeeCode: employee.employeeCode,
  firstName: employee.firstName,
  lastName: employee.lastName,
  // Defaults to present when nothing has been entered yet, so the admin only has to touch the exceptions.
  status: employee.entry?.status || 'present',
  otHours: String(employee.entry?.otHours ?? 0),
  note: employee.entry?.note || ''
});

const TimesheetDay = ({ isAdmin = false }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [isHoliday, setIsHoliday] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const load = useCallback((forDate) => {
    setLoading(true);
    setSavedMessage('');
    timesheetApi(`/day/${forDate}`)
      .then((data) => {
        setIsHoliday(data.isHoliday);
        setRows(data.employees.map(toRow));
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(date), [date, load]);

  const updateRow = (employeeId, field, value) =>
    setRows((current) =>
      current.map((row) => {
        if (row.employeeId !== employeeId) return row;
        const updated = { ...row, [field]: value };
        if (field === 'status' && value !== 'present') updated.otHours = '0';
        return updated;
      })
    );

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      await timesheetApi(`/day/${date}`, {
        method: 'POST',
        body: {
          entries: rows.map((row) => ({
            employeeId: row.employeeId,
            status: row.status,
            otHours: Number(row.otHours) || 0,
            note: row.note
          }))
        }
      });
      setSavedMessage('Saved.');
    } catch (err) {
      setError(err.errors?.length > 0 ? err.errors.join('; ') : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Timesheet" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <label className="ts-date-label">
              Date
              <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </label>
            {!isHoliday && (
              <button type="button" className="em-primary-btn" onClick={handleSave} disabled={saving || loading}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Save day'}
              </button>
            )}
          </div>

          {error && <div className="em-error">{error}</div>}
          {savedMessage && <div className="ts-saved">{savedMessage}</div>}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : isHoliday ? (
            <p className="em-muted">Sunday - a standard holiday. No timesheet entry is needed.</p>
          ) : rows.length === 0 ? (
            <p className="em-muted">No active employees to mark.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>OT hours</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td className="em-code">{row.employeeCode}</td>
                      <td>{`${row.firstName} ${row.lastName}`}</td>
                      <td>
                        <div className="ts-status-group" role="radiogroup">
                          {STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`ts-status-btn ts-${option.value} ${row.status === option.value ? 'active' : ''}`}
                              onClick={() => updateRow(row.employeeId, 'status', option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          className="ts-ot-input"
                          inputMode="decimal"
                          value={row.otHours}
                          disabled={row.status !== 'present'}
                          onChange={(e) => updateRow(row.employeeId, 'otHours', e.target.value)}
                        />
                      </td>
                      <td>
                        {row.status !== 'present' && (
                          <input
                            className="ts-note-input"
                            placeholder="Reason (optional)"
                            value={row.note}
                            onChange={(e) => updateRow(row.employeeId, 'note', e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimesheetDay;
