import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import { employeeApi } from './employeeApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

const EmployeeList = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Wait for typing to pause before querying the server
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);

    setLoading(true);
    employeeApi(`?${params}`)
      .then((data) => {
        if (cancelled) return;
        setEmployees(data.employees);
        setTotalPages(data.totalPages);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, status, page]);

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Employees" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <div className="em-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by code, name or designation..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <div className="em-tabs" role="tablist">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.value}
                  className={`em-tab ${status === tab.value ? 'active' : ''}`}
                  onClick={() => setStatus(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button type="button" className="em-primary-btn" onClick={() => navigate('/employees/new')}>
              <Plus size={18} />
              Add employee
            </button>
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="em-muted">No employees found.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr
                      key={employee.id}
                      className="em-clickable"
                      onClick={() => navigate(`/employees/${employee.id}`)}
                    >
                      <td className="em-code">{employee.employeeCode}</td>
                      <td>{`${employee.firstName} ${employee.lastName}`}</td>
                      <td>{employee.designation}</td>
                      <td>{employee.department || '-'}</td>
                      <td>{employee.dateOfJoining}</td>
                      <td>
                        <span className={`em-status ${employee.status}`}>{employee.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
};

export default EmployeeList;
