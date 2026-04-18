import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/DeleteMaster.css';
import { useNavigate } from 'react-router-dom';
import { Archive, IndianRupee, Warehouse } from 'lucide-react';

const ITEMS_PER_PAGE = 6;

const DeleteMaster = () => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showArchiveSuccess, setShowArchiveSuccess] = useState(false);
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
      } else {
        console.error('Failed to fetch materials');
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

  // Pagination logic
  const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMaterials = filteredMaterials.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  const handleDelete = (material) => {
    setSelectedMaterial(material);
    setIsDeleteModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedMaterial(null);
  };

  const handleConfirmDelete = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/master/archive/${selectedMaterial.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        handleCloseModal();
        
        setShowArchiveSuccess(true);
        setTimeout(() => {
          setShowArchiveSuccess(false);
          fetchMaterials();
        }, 2000);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to archive material'}`);
      }
    } catch (error) {
      console.error('Error archiving material:', error);
      alert('Error archiving material. Please try again.');
    }
  };

  return (
    <div className="dm-wrapper">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar 
        title="Delete Material Master" 
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
        rightContent={
          <button className="dm-archive-icon-btn" onClick={() => navigate('/stock/archived-master')} title="View Archived Materials">
            <Archive size={24} />
          </button>
        }
      />
      <div className="dm-content page-with-navbar">
        <div className="dm-container">
          <div className="dm-main-panel">
            <div className="dm-filter-bar">
              <div className="dm-search-box">
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

              <div className="dm-filter-tabs">
                <button
                  className={`dm-tab ${filterType === 'all' ? 'dm-tab-active' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  All
                </button>
                <button
                  className={`dm-tab ${filterType === 'BOM' ? 'dm-tab-active' : ''}`}
                  onClick={() => setFilterType('BOM')}
                >
                  BOM
                </button>
                <button
                  className={`dm-tab ${filterType === 'FIN' ? 'dm-tab-active' : ''}`}
                  onClick={() => setFilterType('FIN')}
                >
                  FIN
                </button>
              </div>
            </div>

            {loading ? (
              <div className="dm-loading">
                <div className="dm-spinner"></div>
                <p>Loading materials...</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="dm-empty">
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
                <div className="dm-grid">
                  {paginatedMaterials.map((material) => (
                    <div key={material.id} className="dm-card">
                      <div className="dm-card-header">
                        <span className="dm-code-badge">{material.materialCode || 'N/A'}</span>
                        <span className={`dm-flow-badge dm-flow-${material.materialFlow?.toLowerCase()}`}>
                          {material.materialFlow}
                        </span>
                      </div>

                      <div className="dm-card-body">
                        <h3 className="dm-material-name">{material.materialName}</h3>

                        <div className="dm-info-list">
                          <div className="dm-info-row">
                            <span className="dm-label">Category:</span>
                            <span className="dm-value">{material.category || '-'}</span>
                          </div>
                          <div className="dm-info-row">
                            <span className="dm-label">HSN Code:</span>
                            <span className="dm-value">{material.catNo || '-'}</span>
                          </div>
                          <div className="dm-info-row">
                            <span className="dm-label">Cost/Item:</span>
                            <span className="dm-value dm-price">
                              <IndianRupee size={15} />
                              {material.costPerItem || '0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="dm-card-footer">
                        <button
                          className="dm-delete-btn"
                          onClick={() => handleDelete(material)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                          Archive Material
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="dm-pagination"
                />
              </>
            )}
          </div>

          {isDeleteModalOpen && (
            <div className="dm-modal-overlay" onClick={handleCloseModal}>
              <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dm-modal-header">
                  <svg className="dm-warning-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h2>Archive Material</h2>
                  <p className="dm-modal-description">
                    This will move the material to the archive. The material will no longer appear in active inventory.
                  </p>
                </div>

                <div className="dm-material-details">
                  <div className="dm-detail-row">
                    <span className="dm-detail-label">Material Code:</span>
                    <span className="dm-detail-value">{selectedMaterial?.materialCode || 'N/A'}</span>
                  </div>
                  <div className="dm-detail-row">
                    <span className="dm-detail-label">Material Name:</span>
                    <span className="dm-detail-value">{selectedMaterial?.materialName}</span>
                  </div>
                  <div className="dm-detail-row">
                    <span className="dm-detail-label">Category:</span>
                    <span className="dm-detail-value">{selectedMaterial?.category || '-'}</span>
                  </div>
                  <div className="dm-detail-row">
                    <span className="dm-detail-label">Material Flow:</span>
                    <span className={`dm-flow-badge dm-flow-${selectedMaterial?.materialFlow?.toLowerCase()}`}>
                      {selectedMaterial?.materialFlow}
                    </span>
                  </div>
                </div>

                <div className="dm-modal-actions">
                  <button type="button" className="dm-cancel-btn" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="button" className="dm-confirm-btn" onClick={handleConfirmDelete}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Archive
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showArchiveSuccess && <StatusMessage message="Material Master Archived" />}
    </div>
  );
};

export default DeleteMaster;
