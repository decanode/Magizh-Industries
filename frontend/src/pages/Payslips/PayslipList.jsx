import { useState, useEffect, useCallback, Fragment } from 'react';
import { Download, FileX2, FilePlus2 } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { payslipApi, employeeApiForPayslips, pdfDownloadUrl, MONTH_NAMES } from './payslipApi';
import { computeMonthlyPay } from './payrollFormula';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Timesheet/Timesheet.css';
import '../../styles/pageStyles/Payslips/Payslips.css';

const now = new Date();

// The generate panel for one employee+month. Only Days present and OT hours are editable - every
// amount below is computed live from the formula and re-computed by the server again at save time.
const GeneratePanel = ({ preview, onCancel, onSaved }) => {
  const [daysPresent, setDaysPresent] = useState(String(preview.daysPresent));
  const [otHours, setOtHours] = useState(String(preview.otHours));
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState([]);

  const daysPresentNum = Number(daysPresent);
  const otHoursNum = Number(otHours);
  const pay = computeMonthlyPay({
    fixedMonthlySalary: preview.fixedMonthlySalary,
    year: preview.year,
    month: preview.month,
    daysPresent: daysPresentNum,
    otHours: otHoursNum
  });

  const handleConfirm = async () => {
    if (!pay) {
      setProblems([`Days present must be between 0 and ${preview.workingDays}, and OT hours must be 0 or more`]);
      return;
    }
    setSaving(true);
    setProblems([]);
    try {
      await payslipApi('', {
        method: 'POST',
        body: {
          employeeId: preview.employeeId,
          year: preview.year,
          month: preview.month,
          daysPresent: daysPresentNum,
          otHours: otHoursNum
        }
      });
      onSaved();
    } catch (err) {
      setProblems(err.errors?.length > 0 ? err.errors : [err.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="ps-panel-row">
      <td colSpan={5}>
        <div className="ps-panel">
          <h3>
            {preview.firstName} {preview.lastName} ({preview.employeeCode}) —{' '}
            {MONTH_NAMES[preview.month - 1]} {preview.year}
          </h3>

          {preview.alreadyExists && (
            <p className="ps-warning">
              A {preview.existingStatus} payslip already exists for this period.
              {preview.existingStatus === 'voided'
                ? ' Saving will replace it.'
                : ' Void it first, then generate again.'}
            </p>
          )}
          {preview.timesheetIncomplete && (
            <p className="ps-warning">
              Only {preview.daysLogged} of {preview.workingDays} working days have a timesheet entry this month -
              check the numbers below before confirming.
            </p>
          )}

          {problems.length > 0 && (
            <div className="em-error">
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="ps-inputs-row">
            <label>
              Days present (of {preview.workingDays} working days)
              <input inputMode="numeric" value={daysPresent} onChange={(e) => setDaysPresent(e.target.value)} />
            </label>
            <label>
              OT hours
              <input inputMode="decimal" value={otHours} onChange={(e) => setOtHours(e.target.value)} />
            </label>
          </div>

          {!pay ? (
            <p className="ps-warning">
              Days present must be between 0 and {preview.workingDays}, and OT hours must be 0 or more, to compute
              the salary.
            </p>
          ) : (
            <div className="ps-lines">
              <div className="ps-lines-col">
                <h4>Earnings (computed - not editable)</h4>
                {pay.earnings.map((row) => (
                  <div key={row.code} className="ps-line ps-line-readonly">
                    {row.name}
                    <span>{row.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div className="ps-line ps-line-total">
                  Total Earnings
                  <span>{pay.totalEarnings.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="ps-lines-col">
                <h4>Deductions (computed - not editable)</h4>
                {pay.deductions.map((row) => (
                  <div key={row.code} className="ps-line ps-line-readonly">
                    {row.name}
                    <span>{row.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div className="ps-line ps-line-total">
                  Total Deductions
                  <span>{pay.totalDeductions.toLocaleString('en-IN')}</span>
                </div>
                <div className="ps-line ps-line-net">
                  Net Salary
                  <span>{pay.netSalary.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          )}

          <div className="em-actions">
            <button type="button" className="em-secondary-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="em-primary-btn" onClick={handleConfirm} disabled={saving || !pay}>
              {saving ? 'Saving...' : 'Confirm & save'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};

const VoidPanel = ({ payslip, onCancel, onVoided }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setProblem('A reason for voiding is required');
      return;
    }
    setSaving(true);
    setProblem('');
    try {
      await payslipApi(`/${payslip.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      onVoided();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="ps-panel-row">
      <td colSpan={5}>
        <div className="ps-panel">
          <h3>
            Void the payslip for {payslip.firstName} {payslip.lastName} ({payslip.employeeCode}) —{' '}
            {MONTH_NAMES[payslip.month - 1]} {payslip.year}
          </h3>
          {problem && <div className="em-error">{problem}</div>}
          <label className="ps-line">
            Reason *
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </label>
          <div className="em-actions">
            <button type="button" className="em-secondary-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="em-primary-btn em-danger-btn" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Saving...' : 'Confirm void'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};

const PayslipList = ({ isAdmin = false }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [payslipsByEmployee, setPayslipsByEmployee] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingFor, setGeneratingFor] = useState(null); // employeeId
  const [previewData, setPreviewData] = useState(null);
  const [voidingPayslip, setVoidingPayslip] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      employeeApiForPayslips('?status=active&pageSize=50'),
      payslipApi(`?year=${year}&month=${month}`)
    ])
      .then(([employeeData, payslipData]) => {
        setEmployees(employeeData.employees);
        const byEmployee = {};
        payslipData.payslips.forEach((payslip) => {
          byEmployee[payslip.employeeId] = payslip;
        });
        setPayslipsByEmployee(byEmployee);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => load(), [load]);

  const openGenerate = async (employeeId) => {
    setError('');
    try {
      const data = await payslipApi(`/preview?employeeId=${employeeId}&year=${year}&month=${month}`);
      setPreviewData(data);
      setGeneratingFor(employeeId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = async (payslip) => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(pdfDownloadUrl(payslip.id), { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Failed to download the PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Payslip_${payslip.employeeCode}_${payslip.year}-${String(payslip.month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Payslips" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <select className="ts-month-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
            <input type="number" className="ts-year-input" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Fixed salary</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    const payslip = payslipsByEmployee[employee.id];
                    const isGenerating = generatingFor === employee.id;
                    const isVoiding = voidingPayslip?.employeeId === employee.id;

                    return (
                      <Fragment key={employee.id}>
                        <tr>
                          <td className="em-code">{employee.employeeCode}</td>
                          <td>{`${employee.firstName} ${employee.lastName}`}</td>
                          <td>₹{Number(employee.fixedMonthlySalary).toLocaleString('en-IN')}</td>
                          <td>
                            {payslip ? (
                              <span className={`em-status ${payslip.status === 'generated' ? 'active' : 'inactive'}`}>
                                {payslip.status}
                              </span>
                            ) : (
                              <span className="em-muted">Not generated</span>
                            )}
                          </td>
                          <td>
                            {!payslip || payslip.status === 'voided' ? (
                              <button type="button" className="em-secondary-btn" onClick={() => openGenerate(employee.id)}>
                                <FilePlus2 size={16} />
                                {payslip ? 'Regenerate' : 'Generate'}
                              </button>
                            ) : (
                              <div className="ps-row-actions">
                                <button type="button" className="em-icon-btn ps-download-btn" onClick={() => handleDownload(payslip)} title="Download PDF">
                                  <Download size={18} />
                                </button>
                                <button type="button" className="em-icon-btn" onClick={() => setVoidingPayslip(payslip)} title="Void">
                                  <FileX2 size={18} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isGenerating && previewData && (
                          <GeneratePanel
                            preview={previewData}
                            onCancel={() => setGeneratingFor(null)}
                            onSaved={() => {
                              setGeneratingFor(null);
                              load();
                            }}
                          />
                        )}
                        {isVoiding && (
                          <VoidPanel
                            payslip={voidingPayslip}
                            onCancel={() => setVoidingPayslip(null)}
                            onVoided={() => {
                              setVoidingPayslip(null);
                              load();
                            }}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayslipList;
