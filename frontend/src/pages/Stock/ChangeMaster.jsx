import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/ChangeMaster.css';
import { IndianRupee } from 'lucide-react';
import { Dropdown } from 'rsuite';
import 'rsuite/dist/rsuite.min.css';

const ITEMS_PER_PAGE = 6;

const ChangeMaster = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    materialFlow: '',
    class: '',
    category: '',
    materialName: '',
    catNo: '',
    supplierName: '',
    supplierCode: '',
    cgst: '',
    igst: '',
    sgst: '',
    costPerItem: '',
    unit: '',
    materialCode: ''
  });

  const [gstError, setGstError] = useState({
    cgst: false,
    sgst: false,
    igst: false
  });
  const [supplierCodeError, setSupplierCodeError] = useState(false);
  const [showGstError, setShowGstError] = useState(false);
  const [showNoChanges, setShowNoChanges] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);

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

  const handleEdit = (material) => {
    setSelectedMaterial(material);
    setFormData({
      materialFlow: material.materialFlow || '',
      class: material.class || '',
      category: material.category || '',
      materialName: material.materialName || '',
      catNo: material.catNo || '',
      supplierName: material.supplierName || '',
      supplierCode: material.supplierCode || '',
      cgst: material.cgst || '',
      igst: material.igst || '',
      sgst: material.sgst || '',
      costPerItem: material.costPerItem || '',
      unit: material.unit || '',
      materialCode: material.materialCode || ''
    });
    setIsEditModalOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Validate numeric fields
    if (name === 'cgst' || name === 'igst' || name === 'sgst') {
      // Allow only numbers (integers or decimals)
      if (value !== '' && !/^\d*\.?\d*$/.test(value)) {
        return; // Don't update if invalid
      }
      // Check if value exceeds 28 and set error state
      const numValue = parseFloat(value);
      if (value !== '' && numValue > 28) {
        setGstError(prev => ({ ...prev, [name]: true }));
      } else {
        setGstError(prev => ({ ...prev, [name]: false }));
      }
      // Block values less than 0
      if (value !== '' && numValue < 0) {
        return;
      }
    }

    if (name === 'costPerItem') {
      // Allow only numbers and decimals for cost
      if (value !== '' && !/^\d*\.?\d*$/.test(value)) {
        return; // Don't update if invalid
      }
    }

    if (name === 'supplierCode') {
      // Allow only 3 Digit numeric input for Supplier Code
      if (value !== '' && !/^\d{0,3}$/.test(value)) {
        return; // Don't update if invalid
      }
      // Set error if length exceeds 3
      setSupplierCodeError(value.length > 3);
    }

    // Handle GST validation logic
    if (name === 'cgst') {
      //  If entering CGST , (CGST = SGST)
      const numValue = parseFloat(value);
      const hasError = value !== '' && numValue > 28;

      // Update both cgst and sgst values and their error states
      setFormData(prev => ({
        ...prev,
        cgst: value,
        sgst: value // Set SGST to same value as CGST
      }));

      setGstError(prev => ({
        ...prev,
        cgst: hasError,
        sgst: hasError
      }));
    } else if (name === 'sgst') {
      // If entering SGST , (CGST = SGST)
      const numValue = parseFloat(value);
      const hasError = value !== '' && numValue > 28;

      // Update both sgst and cgst values and their error states
      setFormData(prev => ({
        ...prev,
        sgst: value,
        cgst: value // Set CGST to same value as SGST
      }));

      setGstError(prev => ({
        ...prev,
        sgst: hasError,
        cgst: hasError
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setSelectedMaterial(null);
    setFormData({
      materialFlow: '',
      class: '',
      category: '',
      materialName: '',
      catNo: '',
      supplierName: '',
      supplierCode: '',
      cgst: '',
      igst: '',
      sgst: '',
      costPerItem: '',
      unit: '',
      materialCode: ''
    });

    // Reset error states
    setGstError({
      cgst: false,
      sgst: false,
      igst: false
    });
    setHsnError(false);
    setSupplierCodeError(false);
    setShowGstError(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if any changes were made
    const hasChanges = Object.keys(formData).some(key => {
      if (key === 'materialCode') return false; // Skip materialCode comparison
      return formData[key] !== (selectedMaterial[key] || '');
    });

    if (!hasChanges) {
      setShowNoChanges(true);
      setTimeout(() => {
        setShowNoChanges(false);
      }, 2000);
      return;
    }

    // Check if any GST value exceeds 28
    if (gstError.cgst || gstError.sgst || gstError.igst) {
      setShowGstError(true);
      return;
    }

    setShowGstError(false);

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/master/${selectedMaterial.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowUpdateSuccess(true);
        
        // Auto-hide popup after 2 seconds
        setTimeout(() => {
          setShowUpdateSuccess(false);
        }, 2000);
        
        handleCloseModal();
        fetchMaterials();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to update material'}`);
      }
    } catch (error) {
      console.error('Error updating material:', error);
      alert('Error updating material. Please try again.');
    }
  };

  return (
    <div className="cm-wrapper">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Change Material Master" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />
      <div className="cm-content page-with-navbar">
        <div className="cm-container">
          <div className="cm-main-panel">
            <div className="cm-filter-bar">
              <div className="cm-search-box">
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

              <div className="cm-filter-tabs">
                <button
                  className={`cm-tab ${filterType === 'all' ? 'cm-tab-active' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  All
                </button>
                <button
                  className={`cm-tab ${filterType === 'BOM' ? 'cm-tab-active' : ''}`}
                  onClick={() => setFilterType('BOM')}
                >
                  BOM
                </button>
                <button
                  className={`cm-tab ${filterType === 'FIN' ? 'cm-tab-active' : ''}`}
                  onClick={() => setFilterType('FIN')}
                >
                  FIN
                </button>
              </div>
            </div>

            {loading ? (
              <div className="cm-loading">
                <div className="cm-spinner"></div>
                <p>Loading materials...</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="cm-empty">
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
                <div className="cm-grid">
                  {paginatedMaterials.map((material) => (
                    <div key={material.id} className="cm-card">
                      <div className="cm-card-header">
                        <span className="cm-code-badge">{material.materialCode || 'N/A'}</span>
                        <span className={`cm-flow-badge cm-flow-${material.materialFlow?.toLowerCase()}`}>
                          {material.materialFlow}
                        </span>
                      </div>

                      <div className="cm-card-body">
                        <h3 className="cm-material-name">{material.materialName}</h3>

                        <div className="cm-info-list">
                          <div className="cm-info-row">
                            <span className="cm-label">Category:</span>
                            <span className="cm-value">{material.category || '-'}</span>
                          </div>
                          <div className="cm-info-row">
                            <span className="cm-label">HSN Code:</span>
                            <span className="cm-value">{material.catNo || '-'}</span>
                          </div>
                          <div className="cm-info-row">
                            <span className="cm-label">Cost/Item:</span>
                            <span className="cm-value cm-price">
                              <IndianRupee size={15}/>
                              {material.costPerItem || '0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="cm-card-footer">
                        <button
                          className="cm-edit-btn"
                          onClick={() => handleEdit(material)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                          Edit Material
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="cm-pagination"
                />
              </>
            )}
          </div>

          {isEditModalOpen && (
            <div className="cm-modal-overlay" onClick={handleCloseModal}>
              <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="cm-modal-header">
                  <h2>Edit Material</h2>
                </div>

                <form onSubmit={handleSubmit} className="cm-form">
                  <div className="cm-form-section">
                    <h3>Basic Information (Read-Only)</h3>

                    <div className="cm-form-row">
                      <div className="cm-form-group">
                        <label>Material Flow</label>
                        <input
                          type="text"
                          value={formData.materialFlow}
                          readOnly
                          className="cm-readonly-input"
                        />
                      </div>

                      <div className="cm-form-group">
                        <label>Class</label>
                        <input
                          type="text"
                          value={formData.class}
                          readOnly
                          className="cm-readonly-input"
                        />
                      </div>
                    </div>

                    <div className="cm-form-row">
                      <div className="cm-form-group">
                        <label>Category</label>
                        <input
                          type="text"
                          value={formData.category}
                          readOnly
                          className="cm-readonly-input"
                        />
                      </div>

                      <div className="cm-form-group">
                        <label>Material Name</label>
                        <input
                          type="text"
                          value={formData.materialName}
                          readOnly
                          className="cm-readonly-input"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="cm-form-section">
                    <h3>Additional Details</h3>

                    <div className="cm-form-row">
                      <div className="cm-form-group">
                        <label>Catalog Number (CatNo)</label>
                        <input
                          type="text"
                          name="catNo"
                          value={formData.catNo}
                          onChange={handleInputChange}
                          placeholder="Enter catalog number"
                        />
                      </div>

                      <div className="cm-form-group">
                        <label>Supplier Name</label>
                        <input
                          type="text"
                          name="supplierName"
                          value={formData.supplierName}
                          onChange={handleInputChange}
                          placeholder="Enter supplier name"
                        />
                      </div>
                    </div>

                    <div className="cm-form-group">
                      <label>Supplier Code</label>
                      <input
                        type="text"
                        name="supplierCode"
                        value={formData.supplierCode}
                        onChange={handleInputChange}
                        placeholder="Enter supplier code (max 3 digits)"
                        className={`${supplierCodeError ? 'cm-error-input' : ''}`}
                      />
                    </div>

                    <div className="cm-form-row cm-tax-row">
                      <div className="cm-form-group">
                        <label>CGST (%)</label>
                        <div className="cm-input-with-icon">
                          <input
                            type="text"
                            name="cgst"
                            value={formData.cgst}
                            onChange={handleInputChange}
                            placeholder="CGST"
                            disabled={formData.igst !== ''}
                            className={`${formData.igst !== '' ? 'cm-disabled-input' : ''} ${gstError.cgst ? 'cm-error-input' : ''}`}
                          />
                          {formData.igst !== '' && (
                            <svg className="cm-lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="cm-form-group">
                        <label>SGST (%)</label>
                        <div className="cm-input-with-icon">
                          <input
                            type="text"
                            name="sgst"
                            value={formData.sgst}
                            onChange={handleInputChange}
                            placeholder="SGST"
                            disabled={formData.igst !== ''}
                            className={`${formData.igst !== '' ? 'cm-disabled-input' : ''} ${gstError.sgst ? 'cm-error-input' : ''}`}
                          />
                          {formData.igst !== '' && (
                            <svg className="cm-lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="cm-form-group">
                        <label>IGST (%)</label>
                        <div className="cm-input-with-icon">
                          <input
                            type="text"
                            name="igst"
                            value={formData.igst}
                            onChange={handleInputChange}
                            placeholder="IGST"
                            disabled={formData.cgst !== '' || formData.sgst !== ''}
                            className={`${formData.cgst !== '' || formData.sgst !== '' ? 'cm-disabled-input' : ''} ${gstError.igst ? 'cm-error-input' : ''}`}
                          />
                          {(formData.cgst !== '' || formData.sgst !== '') && (
                            <svg className="cm-lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="cm-form-group">
                        <label>Cost Per Item</label>
                        <div className="cm-input-with-icon">
                          <IndianRupee size={16} className="cm-rupee-icon" />
                          <input
                            type="text"
                            name="costPerItem"
                            value={formData.costPerItem}
                            onChange={handleInputChange}
                            placeholder="Enter cost"
                          />
                        </div>
                      </div>

                      <div className="cm-form-group">
                        <label>Unit</label>
                        <Dropdown
                          title={formData.unit ? `${formData.unit} (${formData.unit === 'EA' ? 'Each' : formData.unit === 'KG' ? 'Kilogram' : formData.unit === 'M' ? 'Meter' : 'Strip'})` : "Select unit"}
                          onSelect={(value) => handleInputChange({ target: { name: 'unit', value } })}
                          className="rsuite-dropdown"
                        >
                          <Dropdown.Item eventKey="EA">EA (Each)</Dropdown.Item>
                          <Dropdown.Item eventKey="KG">KG (Kilogram)</Dropdown.Item>
                          <Dropdown.Item eventKey="M">M (Meter)</Dropdown.Item>
                          <Dropdown.Item eventKey="ST">ST (Strip)</Dropdown.Item>
                        </Dropdown>
                      </div>
                    </div>
                  </div>

                  <div className="cm-form-actions">
                    {showNoChanges && (
                      <div className="cm-no-changes-message">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>No Changes</span>
                      </div>
                    )}
                    {showGstError && (gstError.cgst || gstError.sgst || gstError.igst) && (
                      <div className="cm-gst-error-message">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>GST values cannot exceed 28%</span>
                      </div>
                    )}
                    <button type="button" className="cm-cancel-btn" onClick={handleCloseModal}>
                      Cancel
                    </button>
                    <button type="submit" className="cm-save-btn">
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showUpdateSuccess && <StatusMessage message="Material Master Updated" />}
    </div>
  );
};

export default ChangeMaster;
