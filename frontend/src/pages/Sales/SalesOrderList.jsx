import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import { salesApi, formatMoney, formatDate } from './salesApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Open', label: 'Open' },
  { value: 'In Delivery', label: 'In delivery' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Cancelled', label: 'Cancelled' }
];

const SalesOrderList = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
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

    salesApi(`?search=${encodeURIComponent(search)}&status=${status}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((data) => {
        if (cancelled) return;
        setOrders(data.items);
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
      <Navbar title="Sales Orders" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <div className="em-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by order number, customer or PO number..."
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

            <button type="button" className="em-primary-btn" onClick={() => navigate('/sales/orders/new')}>
              <Plus size={18} />
              New sales order
            </button>
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading sales orders...</p>
          ) : orders.length === 0 ? (
            <p className="em-muted">No sales orders found.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>PO No</th>
                    <th>Items</th>
                    <th>Total (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="em-clickable" onClick={() => navigate(`/sales/orders/${order.id}`)}>
                      <td className="em-code">{order.soNumber}</td>
                      <td>{formatDate(order.orderDate)}</td>
                      <td>{order.customer?.name}</td>
                      <td>{order.customerPoNumber || '-'}</td>
                      <td>{order.lineCount}</td>
                      <td>{formatMoney(order.totals?.grandTotal)}</td>
                      <td>
                        <span className={`em-status ${order.status === 'Cancelled' ? 'inactive' : order.status === 'Delivered' ? 'active' : 'pending'}`}>{order.status}</span>
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

export default SalesOrderList;
