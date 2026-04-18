import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import Popup from '../../components/popup';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/ArchivedMaster.css';
import { Undo2, Trash2 } from 'lucide-react';

const ITEMS_PER_PAGE = 6;

const ArchivedMaster = () => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [archivedMaterials, setArchivedMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isRestorePopupOpen, setIsRestorePopupOpen] = useState(false);
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showRestoreSuccess, setShowRestoreSuccess] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchArchivedMaterials();
  }, []);

  const fetchArchivedMaterials = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/archive`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setArchivedMaterials(data.archives || []);
      } else {
        console.error('Failed to fetch archived materials');
      }
    } catch (error) {
      console.error('Error fetching archived materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreMaterial = async (archive) => {
    setSelectedMaterial(archive);
    setIsRestorePopupOpen(true);
  };

  const confirmRestoreMaterial = async () => {
    if (!selectedMaterial) return;

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/archive/${selectedMaterial.id}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setIsRestorePopupOpen(false);
        setSelectedMaterial(null);
        
        setShowRestoreSuccess(true);
        setTimeout(() => {
          setShowRestoreSuccess(false);
          fetchArchivedMaterials();
        }, 2000);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to restore material'}`);
      }
    } catch (error) {
      console.error('Error restoring material:', error);
      alert('Error restoring material. Please try again.');
    }
  };

  const handlePermanentDelete = async (archive) => {
    setSelectedMaterial(archive);
    setIsDeletePopupOpen(true);
  };

  const confirmPermanentDelete = async () => {
    if (!selectedMaterial) return;

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/archive/${selectedMaterial.id}/permanent`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setIsDeletePopupOpen(false);
        setSelectedMaterial(null);
        
        setShowDeleteSuccess(true);
        setTimeout(() => {
          setShowDeleteSuccess(false);
          fetchArchivedMaterials();
        }, 2000);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to delete material'}`);
      }
    } catch (error) {
      console.error('Error deleting material:', error);
      alert('Error deleting material. Please try again.');
    }
  };

  const filteredArchivedMaterials = archivedMaterials.filter(material => {
    const matchesSearch =
      material.materialCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.materialName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterType === 'all' || material.materialFlow === filterType;

    return matchesSearch && matchesFilter;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredArchivedMaterials.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMaterials = filteredArchivedMaterials.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  return (
    <div className="am-wrapper">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar 
        title="Archived Materials" 
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <div className="am-content page-with-navbar">
        <div className="am-container">
          <div className="am-main-panel">
            <div className="am-filter-bar">
              <div className="am-search-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search by Material Code or Material Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="am-filter-tabs">
                <button
                  className={`am-tab ${filterType === 'all' ? 'am-tab-active' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  All
                </button>
                <button
                  className={`am-tab ${filterType === 'BOM' ? 'am-tab-active' : ''}`}
                  onClick={() => setFilterType('BOM')}
                >
                  BOM
                </button>
                <button
                  className={`am-tab ${filterType === 'FIN' ? 'am-tab-active' : ''}`}
                  onClick={() => setFilterType('FIN')}
                >
                  FIN
                </button>
              </div>
            </div>

            {loading ? (
              <div className="am-loading">
                <div className="am-spinner"></div>
                <p>Loading archived materials...</p>
              </div>
            ) : filteredArchivedMaterials.length === 0 ? (
              <div className="am-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                </svg>
                <h2>No Archived Materials</h2>
                <p>{searchTerm ? 'Try adjusting your search criteria' : 'No materials have been archived yet'}</p>
              </div>
            ) : (
              <>
                <div className="am-grid">
                  {paginatedMaterials.map((material) => (
                    <div key={material.id} className="am-card">
                      <div className="am-card-header">
                        <span className="am-code-badge">{material.materialCode || 'N/A'}</span>
                        <span className={`am-flow-badge am-flow-${material.materialFlow?.toLowerCase()}`}>
                          {material.materialFlow}
                        </span>
                      </div>

                      <div className="am-card-body">
                        <h3 className="am-material-name">{material.materialName}</h3>

                        <div className="am-info-list">
                          <div className="am-info-row">
                            <span className="am-label">Category:</span>
                            <span className="am-value">{material.category || '-'}</span>
                          </div>
                          <div className="am-info-row">
                            <span className="am-label">HSN Code:</span>
                            <span className="am-value">{material.catNo || '-'}</span>
                          </div>
                          <div className="am-info-row">
                            <span className="am-label">Archived:</span>
                            <span className="am-value am-archived-date">
                              {material.archivedAt ? new Date(material.archivedAt).toLocaleDateString() : '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="am-card-footer">
                        <button
                          className="am-restore-btn"
                          onClick={() => handleRestoreMaterial(material)}
                          title="Restore to active inventory"
                        >
                          <Undo2 size={16} />
                          Restore
                        </button>
                        <button
                          className="am-permanent-delete-btn"
                          onClick={() => handlePermanentDelete(material)}
                          title="Permanently delete"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="am-pagination"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Restore Confirmation Popup */}
      <Popup
        isOpen={isRestorePopupOpen}
        onClose={() => setIsRestorePopupOpen(false)}
        onConfirm={confirmRestoreMaterial}
        message="Are you sure you want to restore this material to active inventory?"
        type="warning"
        confirmText="Yes, Restore"
        cancelText="Cancel"
      >
        <div className="am-popup-material-info">
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Code:</span>
            <span className="am-popup-value">{selectedMaterial?.materialCode}</span>
          </div>
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Flow:</span>
            <span className={`am-popup-flow-badge am-popup-flow-${selectedMaterial?.materialFlow?.toLowerCase()}`}>
              {selectedMaterial?.materialFlow}
            </span>
          </div>
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Name:</span>
            <span className="am-popup-value">{selectedMaterial?.materialName}</span>
          </div>
        </div>
      </Popup>

      {/* Permanent Delete Confirmation Popup */}
      <Popup
        isOpen={isDeletePopupOpen}
        onClose={() => setIsDeletePopupOpen(false)}
        onConfirm={confirmPermanentDelete}
        message="PERMANENTLY DELETE this material? This action CANNOT be undone!"
        type="danger"
        confirmText="Yes, Delete"
        cancelText="Cancel"
      >
        <div className="am-popup-material-info">
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Code:</span>
            <span className="am-popup-value">{selectedMaterial?.materialCode}</span>
          </div>
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Flow:</span>
            <span className={`am-popup-flow-badge am-popup-flow-${selectedMaterial?.materialFlow?.toLowerCase()}`}>
              {selectedMaterial?.materialFlow}
            </span>
          </div>
          <div className="am-popup-info-row">
            <span className="am-popup-label">Material Name:</span>
            <span className="am-popup-value">{selectedMaterial?.materialName}</span>
          </div>
        </div>
      </Popup>
      
      {showRestoreSuccess && <StatusMessage message="Material Master Restored" />}
      {showDeleteSuccess && <StatusMessage message="Material Master Deleted" />}
    </div>
  );
};

export default ArchivedMaster;
