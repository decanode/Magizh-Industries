import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, UserX, UserCheck } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { employeeApi } from './employeeApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const EMPTY_EMPLOYEE = {
  firstName: '',
  lastName: '',
  fatherName: '',
  dob: '',
  email: '',
  phone: '',
  aadhaar: '',
  pan: '',
  designation: '',
  department: '',
  dateOfJoining: '',
  fixedMonthlySalary: '',
  bankName: '',
  bankAccountNumber: '',
  pfAccountNumber: ''
};

// Mirrors the backend rules so problems show before submit. The server still has the final say.
const findProblems = (form) => {
  const problems = [];

  if (!form.firstName.trim()) problems.push('First name is required');
  if (!form.lastName.trim()) problems.push('Last name is required');
  if (!form.designation.trim()) problems.push('Designation is required');
  if (!form.dateOfJoining) problems.push('Date of joining is required');

  const salary = Number(form.fixedMonthlySalary);
  if (form.fixedMonthlySalary === '' || !Number.isFinite(salary) || salary <= 0) {
    problems.push('Fixed monthly salary must be a number greater than 0');
  }

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) problems.push('Email is invalid');
  if (form.phone && !/^\d{10}$/.test(form.phone)) problems.push('Phone must be 10 digits');

  if (form.aadhaar && !/^\d{12}$/.test(form.aadhaar.replace(/[\s-]/g, ''))) {
    problems.push('Aadhaar must be 12 digits');
  }
  if (form.pan && !PAN_PATTERN.test(form.pan.toUpperCase())) {
    problems.push('PAN must be in the standard format, e.g. ABCDE1234F');
  }

  return problems;
};

const toPayload = (form) => ({
  ...form,
  fixedMonthlySalary: Number(form.fixedMonthlySalary),
  pan: form.pan.trim(),
  aadhaar: form.aadhaar.trim()
});

const EmployeeForm = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY_EMPLOYEE);
  const [meta, setMeta] = useState(null); // employeeCode, status, exitReason, exitDate from the server
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState([]);
  const [showExitBox, setShowExitBox] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exitSaving, setExitSaving] = useState(false);

  const hasLeft = meta?.status === 'inactive';

  const loadEmployee = () =>
    employeeApi(`/${id}`).then(({ employee }) => {
      setMeta({
        employeeCode: employee.employeeCode,
        status: employee.status,
        exitReason: employee.exitReason,
        exitDate: employee.exitDate
      });
      setForm({
        ...EMPTY_EMPLOYEE,
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        fatherName: employee.fatherName || '',
        dob: employee.dob || '',
        email: employee.email || '',
        phone: employee.phone || '',
        aadhaar: employee.aadhaar || '',
        pan: employee.pan || '',
        designation: employee.designation || '',
        department: employee.department || '',
        dateOfJoining: employee.dateOfJoining || '',
        fixedMonthlySalary: employee.fixedMonthlySalary ?? '',
        bankName: employee.bankName || '',
        bankAccountNumber: employee.bankAccountNumber || '',
        pfAccountNumber: employee.pfAccountNumber || ''
      });
    });

  useEffect(() => {
    if (!isEdit) return;
    loadEmployee()
      .catch((err) => setProblems([err.message]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const found = findProblems(form);
    if (found.length > 0) {
      setProblems(found);
      return;
    }

    setSaving(true);
    setProblems([]);
    try {
      if (isEdit) {
        await employeeApi(`/${id}`, { method: 'PUT', body: toPayload(form) });
      } else {
        await employeeApi('', { method: 'POST', body: toPayload(form) });
      }
      navigate('/employees');
    } catch (err) {
      setProblems(err.errors?.length > 0 ? err.errors : [err.message]);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsLeft = async () => {
    if (!exitReason.trim()) {
      setProblems(['A reason for leaving is required']);
      return;
    }

    setExitSaving(true);
    setProblems([]);
    try {
      await employeeApi(`/${id}`, { method: 'DELETE', body: { reason: exitReason.trim() } });
      setShowExitBox(false);
      setExitReason('');
      await loadEmployee();
    } catch (err) {
      setProblems([err.message]);
    } finally {
      setExitSaving(false);
    }
  };

  const handleReactivate = async () => {
    setExitSaving(true);
    setProblems([]);
    try {
      await employeeApi(`/${id}/reactivate`, { method: 'POST' });
      await loadEmployee();
    } catch (err) {
      setProblems([err.message]);
    } finally {
      setExitSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="em-container">
        <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
        <Navbar title="Employee" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />
        <div className="em-content page-with-navbar">
          <p className="em-muted">Loading employee...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar
        title={isEdit ? `Edit employee ${meta?.employeeCode || ''}` : 'New employee'}
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <div className="em-content page-with-navbar">
        <div className="em-form">
          {problems.length > 0 && (
            <div className="em-error">
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {isEdit && hasLeft && (
            <section className="em-section em-exit-banner">
              <h3>This employee has left the company</h3>
              <p>
                <strong>Reason:</strong> {meta.exitReason || '-'}
              </p>
              <p>
                <strong>Left on:</strong> {meta.exitDate ? new Date(meta.exitDate).toLocaleDateString() : '-'}
              </p>
              <p className="em-muted">No changes can be made until this employee rejoins.</p>
              <button type="button" className="em-primary-btn" onClick={handleReactivate} disabled={exitSaving}>
                <UserCheck size={18} />
                {exitSaving ? 'Reactivating...' : 'Reactivate (employee rejoined)'}
              </button>
            </section>
          )}

          <fieldset className="em-fieldset" disabled={hasLeft}>
            <form onSubmit={handleSubmit} noValidate>
              <section className="em-section">
                <h3>Personal details</h3>
                <div className="em-grid">
                  <label>
                    First name *
                    <input value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                  </label>
                  <label>
                    Last name *
                    <input value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                  </label>
                  <label>
                    Father's name
                    <input value={form.fatherName} onChange={(e) => updateField('fatherName', e.target.value)} />
                  </label>
                  <label>
                    Date of birth
                    <input type="date" value={form.dob} onChange={(e) => updateField('dob', e.target.value)} />
                  </label>
                  <label>
                    Email
                    <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                  </label>
                  <label>
                    Phone (10 digits)
                    <input
                      inputMode="numeric"
                      maxLength={10}
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
                    />
                  </label>
                  <label>
                    Aadhaar number
                    <input
                      inputMode="numeric"
                      maxLength={12}
                      value={form.aadhaar}
                      onChange={(e) => updateField('aadhaar', e.target.value.replace(/\D/g, ''))}
                      placeholder="12 digits"
                    />
                  </label>
                  <label>
                    PAN
                    <input
                      className="em-code-input"
                      maxLength={10}
                      value={form.pan}
                      onChange={(e) => updateField('pan', e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                    />
                  </label>
                </div>
              </section>

              <section className="em-section">
                <h3>Job details</h3>
                <div className="em-grid">
                  <label>
                    Designation *
                    <input value={form.designation} onChange={(e) => updateField('designation', e.target.value)} />
                  </label>
                  <label>
                    Department
                    <input value={form.department} onChange={(e) => updateField('department', e.target.value)} />
                  </label>
                  <label>
                    Date of joining *
                    <input
                      type="date"
                      value={form.dateOfJoining}
                      onChange={(e) => updateField('dateOfJoining', e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="em-section">
                <h3>Salary and bank details</h3>
                <p className="em-muted">
                  Basic, Conveyance and Special Allowance are calculated from the fixed monthly salary when a
                  payslip is generated (50% / 25% / 25%), so only the one total is entered here.
                </p>
                <div className="em-grid">
                  <label>
                    Fixed monthly salary (₹) *
                    <input
                      inputMode="decimal"
                      value={form.fixedMonthlySalary}
                      onChange={(e) => updateField('fixedMonthlySalary', e.target.value)}
                    />
                  </label>
                  <label>
                    PF account number
                    <input
                      value={form.pfAccountNumber}
                      onChange={(e) => updateField('pfAccountNumber', e.target.value)}
                    />
                  </label>
                  <label>
                    Bank name
                    <input value={form.bankName} onChange={(e) => updateField('bankName', e.target.value)} />
                  </label>
                  <label>
                    Bank account number
                    <input
                      value={form.bankAccountNumber}
                      onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <div className="em-actions">
                <button type="button" className="em-secondary-btn" onClick={() => navigate('/employees')}>
                  Cancel
                </button>
                <button type="submit" className="em-primary-btn" disabled={saving}>
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save employee'}
                </button>
              </div>
            </form>
          </fieldset>

          {isEdit && !hasLeft && (
            <section className="em-section em-exit-section">
              {!showExitBox ? (
                <button type="button" className="em-secondary-btn em-danger-btn" onClick={() => setShowExitBox(true)}>
                  <UserX size={18} />
                  Mark as left the company
                </button>
              ) : (
                <div className="em-exit-box">
                  <label>
                    Reason for leaving *
                    <textarea
                      value={exitReason}
                      onChange={(e) => setExitReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Resigned - better opportunity"
                    />
                  </label>
                  <div className="em-actions">
                    <button
                      type="button"
                      className="em-secondary-btn"
                      onClick={() => {
                        setShowExitBox(false);
                        setExitReason('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="em-primary-btn em-danger-btn"
                      onClick={handleMarkAsLeft}
                      disabled={exitSaving}
                    >
                      {exitSaving ? 'Saving...' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeForm;
