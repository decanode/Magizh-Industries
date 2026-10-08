import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import { invoiceApi, formatMoney, formatDate, invoiceState } from './salesApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Issued', label: 'Issued' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Cancelled', label: 'Cancelled' }
];

const InvoiceList = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    invoiceApi(`?search=${encodeURIComponent(search)}&status=${status}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [search, status, page]);

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Invoices" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <div className="em-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by invoice no, delivery no, order no or customer..."
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
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading invoices...</p>
          ) : items.length === 0 ? (
            <p className="em-muted">No invoices found. Create one from a delivery once the customer has confirmed the costing.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Delivery</th>
                    <th>Due</th>
                    <th>Total (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((invoice) => {
                    const state = invoiceState(invoice);
                    return (
                      <tr key={invoice.id} className="em-clickable" onClick={() => navigate(`/sales/invoices/${invoice.id}`)}>
                        <td className="em-code">{invoice.invoiceNumber}</td>
                        <td>{formatDate(invoice.invoiceDate)}</td>
                        <td>{invoice.customer?.name}</td>
                        <td>{invoice.dcNumber}</td>
                        <td>{formatDate(invoice.dueDate)}</td>
                        <td>{formatMoney(invoice.totals?.grandTotal)}</td>
                        <td><span className={`em-status ${state.tone}`}>{state.label}</span></td>
                      </tr>
                    );
                  })}
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

export default InvoiceList;
