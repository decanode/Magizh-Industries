import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/Entry.css';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, Search, SquareCheckBig, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

const ITEMS_PER_PAGE = 25;

const COLUMNS = [
  { key: 'materialCode', label: 'Code', numeric: true },
  { key: 'materialName', label: 'Material Name' },
  { key: 'materialFlow', label: 'Flow' },
  { key: 'class', label: 'Class' },
  { key: 'category', label: 'Category' },
  { key: 'catNo', label: 'Cat No' },
  { key: 'unit', label: 'Unit' },
  { key: 'costPerItem', label: 'Cost / Item', numeric: true, align: 'right' }
];

const Entry = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'materialCode', direction: 'asc' });
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/master`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMaterials(data.masters || []);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const classOptions = [...new Set(materials.map((material) => material.class).filter(Boolean))].sort();

  const filteredMaterials = materials
    .filter(material => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term || [material.materialCode, material.materialName, material.catNo]
        .some(value => String(value || '').toLowerCase().includes(term));
      const matchesFlow = filterType === 'all' || material.materialFlow === filterType;
      const matchesClass = classFilter === 'all' || material.class === classFilter;
      return matchesSearch && matchesFlow && matchesClass;
    })
    .sort((a, b) => {
      const column = COLUMNS.find(col => col.key === sort.key);
      const left = a[sort.key] ?? '';
      const right = b[sort.key] ?? '';
      const result = column?.numeric
        ? (parseFloat(left) || 0) - (parseFloat(right) || 0)
        : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
      return sort.direction === 'asc' ? result : -result;
    });

  const handleSort = (key) => {
    setSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMaterials = filteredMaterials.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, classFilter, sort]);

  const handleSelect = (material) => {
    navigate('/stock/entry-stock', { state: { material } });
  };

  return (
    <div className="en-wrapper">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Material Entry" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />
      <div className="en-content page-with-navbar">
        <div className="en-container">
          <div className="en-main-panel">
            <div className="en-filter-bar">
              <div className="en-search-box">
                <Search size={20} />
                <input
                  type="text"
                  placeholder="Search by Material Code, Name or Cat No"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="en-filter-tabs">
                <button className={`en-tab ${filterType === 'all' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('all')}>All</button>
                <button className={`en-tab ${filterType === 'BOM' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('BOM')}>BOM</button>
                <button className={`en-tab ${filterType === 'FIN' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('FIN')}>FIN</button>
              </div>

              <select
                className="en-class-select"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                aria-label="Filter by class"
              >
                <option value="all">All classes</option>
                {classOptions.map(cls => (
                  <option key={cls} value={cls}>Class {cls}</option>
                ))}
              </select>
            </div>

            {!loading && (
              <div className="en-result-count">
                Showing {filteredMaterials.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredMaterials.length)} of {filteredMaterials.length} materials
              </div>
            )}

            {loading ? (
              <div className="en-loading">
                <div className="en-spinner"></div>
                <p>Loading materials...</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="en-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h2>No Materials Found</h2>
                <p>{searchTerm ? 'Try adjusting your search criteria' : 'No materials available'}</p>
              </div>
            ) : (
              <>
                <div className="en-table-wrap">
                  <table className="en-table">
                    <thead>
                      <tr>
                        {COLUMNS.map(column => {
                          const active = sort.key === column.key;
                          const SortIcon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                          return (
                            <th
                              key={column.key}
                              className={`en-th-sortable ${active ? 'en-th-active' : ''} ${column.align === 'right' ? 'en-right' : ''}`}
                              onClick={() => handleSort(column.key)}
                              aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <span>{column.label}</span>
                              <SortIcon size={14} />
                            </th>
                          );
                        })}
                        <th className="en-th-action"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMaterials.map((material) => (
                        <tr key={material.id} onClick={() => handleSelect(material)}>
                          <td><span className="en-code-pill">{material.materialCode || 'N/A'}</span></td>
                          <td className="en-td-name">{material.materialName}</td>
                          <td>
                            <span className={`en-flow-badge en-flow-${material.materialFlow?.toLowerCase()}`}>
                              {material.materialFlow}
                            </span>
                          </td>
                          <td>{material.class || '-'}</td>
                          <td>{material.category || '-'}</td>
                          <td>{material.catNo || '-'}</td>
                          <td>{material.unit || '-'}</td>
                          <td className="en-right en-td-cost">
                            <IndianRupee size={13} />
                            {material.costPerItem || '0'}
                          </td>
                          <td className="en-td-action">
                            <button
                              className="en-row-select-btn"
                              onClick={(e) => { e.stopPropagation(); handleSelect(material); }}
                              title="Select for entry"
                            >
                              <SquareCheckBig size={15} />
                              Select
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="en-pagination"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Entry;
