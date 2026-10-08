import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import { deliveryApi, formatMoney, formatDate, deliveryState } from './salesApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'CostingPending', label: 'Costing pending' },
  { value: 'CostingConfirmed', label: 'Ready to invoice' },
  { value: 'Invoiced', label: 'Invoiced' },
  { value: 'Cancelled', label: 'Cancelled' }
];

const DeliveryList = ({ isAdmin = false }) => {
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

    deliveryApi(`?search=${encodeURIComponent(search)}&status=${status}&page=${page}&pageSize=${PAGE_SIZE}`)
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
      <Navbar title="Deliveries" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <div className="em-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by delivery no, order no, customer or vehicle..."
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
            <p className="em-muted">Loading deliveries...</p>
          ) : items.length === 0 ? (
            <p className="em-muted">No deliveries found. Create one from a sales order.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Delivery No</th>
                    <th>Date</th>
                    <th>Order No</th>
                    <th>Customer</th>
                    <th>Ship-to</th>
                    <th>Total (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((delivery) => {
                    const state = deliveryState(delivery);
                    return (
                      <tr key={delivery.id} className="em-clickable" onClick={() => navigate(`/sales/deliveries/${delivery.id}`)}>
                        <td className="em-code">{delivery.dcNumber}</td>
                        <td>{formatDate(delivery.deliveryDate)}</td>
                        <td>{delivery.soNumber}</td>
                        <td>{delivery.customer?.name}</td>
                        <td>{delivery.shipTo?.label || delivery.shipTo?.city}</td>
                        <td>{formatMoney(delivery.totals?.grandTotal)}</td>
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

export default DeliveryList;
