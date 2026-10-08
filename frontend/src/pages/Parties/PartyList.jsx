import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Search, Archive } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import Popup, { StatusMessage, Pagination } from '../../components/popup';
import { PARTY_TYPES, partyApi } from './partyConfig';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Stock/DeleteMaster.css';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Pick-a-record list. Modes: change (opens the edit form), delete (archives after confirming, like Material
// Master) and archived (restores). Nothing is ever permanently deleted.
const PartyList = ({ isAdmin = false, mode }) => {
  const navigate = useNavigate();
  const { type } = useParams();
  const party = PARTY_TYPES[type];
  const isDelete = mode === 'delete';
  const isArchived = mode === 'archived';

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!party) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');

    partyApi(type, `${isArchived ? '/archived' : ''}?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotalPages(data.totalPages);
        // Deleting the last row of a page leaves it empty - step back instead of showing nothing.
        if (data.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [type, party, isArchived, search, page, reloadKey]);

  if (!party) return <Navigate to="/master-data" replace />;
  if ((isDelete || isArchived) && !isAdmin) return <Navigate to={party.route} replace />;

  const handleConfirm = async () => {
    const item = selected;
    setSelected(null);
    try {
      await partyApi(type, isArchived ? `/archived/${item.id}/restore` : `/${item.id}/archive`, { method: 'POST' });
      setStatusMessage(isArchived ? `${party.label} Master Restored` : `${party.label} Master Archived`);
      setTimeout(() => {
        setStatusMessage('');
        setReloadKey((key) => key + 1);
      }, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar
        title={isArchived ? `Archived ${party.plural}` : `${isDelete ? 'Delete' : 'Change'} ${party.label} Master`}
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
        rightContent={
          isDelete && (
            <button
              className="dm-archive-icon-btn"
              onClick={() => navigate(`${party.route}/archived`)}
              title={`View Archived ${party.plural}`}
            >
              <Archive size={24} />
            </button>
          )
        }
      />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          <div className="em-toolbar">
            <div className="em-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by code, name, contact, city or GSTIN..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button type="button" className="em-secondary-btn" onClick={() => navigate(isArchived ? `${party.route}/delete` : party.route)}>
              Back
            </button>
          </div>

          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading {party.plural.toLowerCase()}...</p>
          ) : items.length === 0 ? (
            <p className="em-muted">No {party.plural.toLowerCase()} found.</p>
          ) : (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>City</th>
                    {(isDelete || isArchived) && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={isDelete || isArchived ? undefined : 'em-clickable'}
                      onClick={isDelete || isArchived ? undefined : () => navigate(`${party.route}/change/${item.id}`)}
                    >
                      <td className="em-code">{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.contactPerson || '-'}</td>
                      <td>{item.phone || '-'}</td>
                      <td>{item.city || '-'}</td>
                      {(isDelete || isArchived) && (
                        <td>
                          <button
                            type="button"
                            className={`em-secondary-btn ${isArchived ? '' : 'em-danger-btn'}`}
                            onClick={() => setSelected(item)}
                          >
                            {isArchived ? 'Restore' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      <Popup
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirm}
        message={
          isArchived
            ? `Are you sure you want to restore this ${party.label.toLowerCase()}?`
            : `Are you sure you want to archive this ${party.label.toLowerCase()}? You can restore it later from the archive.`
        }
        type={isArchived ? 'warning' : 'danger'}
        confirmText={isArchived ? 'Yes, Restore' : 'Yes, Archive'}
        cancelText="Cancel"
      >
        <p>
          <strong>{selected?.code}</strong> - {selected?.name}
        </p>
      </Popup>

      {statusMessage && <StatusMessage message={statusMessage} />}
    </div>
  );
};

export default PartyList;
