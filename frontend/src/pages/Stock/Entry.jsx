import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/Entry.css';
import { useNavigate } from 'react-router-dom';
import { IndianRupee } from 'lucide-react';

const ITEMS_PER_PAGE = 6;

const Entry = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
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

  const filteredMaterials = materials.filter(material => {
    const matchesSearch =
      material.materialCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.materialName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || material.materialFlow === filterType;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMaterials = filteredMaterials.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

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
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search by Material Code or Name"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="en-filter-tabs">
                <button className={`en-tab ${filterType === 'all' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('all')}>All</button>
                <button className={`en-tab ${filterType === 'BOM' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('BOM')}>BOM</button>
                <button className={`en-tab ${filterType === 'FIN' ? 'en-tab-active' : ''}`} onClick={() => setFilterType('FIN')}>FIN</button>
              </div>
            </div>

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
                <div className="en-grid">
                  {paginatedMaterials.map((material) => (
                    <div key={material.id} className="en-card">
                      <div className="en-card-header">
                        <span className="en-code-badge">{material.materialCode || 'N/A'}</span>
                        <span className={`en-flow-badge en-flow-${material.materialFlow?.toLowerCase()}`}>
                          {material.materialFlow}
                        </span>
                      </div>

                      <div className="en-card-body">
                        <h3 className="en-material-name">{material.materialName}</h3>
                        <div className="en-info-list">
                          <div className="en-info-row">
                            <span className="en-label">Category:</span>
                            <span className="en-value">{material.category || '-'}</span>
                          </div>
                          <div className="en-info-row">
                            <span className="en-label">HSN Code:</span>
                            <span className="en-value">{material.catNo || '-'}</span>
                          </div>
                          <div className="en-info-row">
                            <span className="en-label">Cost/Item:</span>
                            <span className="en-value en-price">
                              <IndianRupee size={15} />
                              {material.costPerItem || '0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="en-card-footer">
                        <button className="en-select-btn" onClick={() => handleSelect(material)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 11 12 14 22 4"></polyline>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                          </svg>
                          Select for Entry
                        </button>
                      </div>
                    </div>
                  ))}
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
