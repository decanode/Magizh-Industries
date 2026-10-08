import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/ChangeMaster.css';
import { IndianRupee, Search, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { Dropdown } from 'rsuite';
import 'rsuite/dist/rsuite.min.css';

const ITEMS_PER_PAGE = 25;

// Column definitions for the list view. `sortValue` decides how a column orders; numeric ones compare as numbers.
const COLUMNS = [
  { key: 'materialCode', label: 'Code', numeric: true },
  { key: 'materialName', label: 'Material Name' },
  { key: 'materialFlow', label: 'Flow' },
  { key: 'class', label: 'Class' },
  { key: 'category', label: 'Category' },
  { key: 'catNo', label: 'Cat No' },
  { key: 'supplierName', label: 'Supplier' },
  { key: 'unit', label: 'Unit' },
  { key: 'costPerItem', label: 'Cost / Item', numeric: true, align: 'right' }
];

const ChangeMaster = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'materialCode', direction: 'asc' });
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
    hsnCode: '',
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

  const classOptions = [...new Set(materials.map((material) => material.class).filter(Boolean))].sort();

  const filteredMaterials = materials
    .filter(material => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term || [
        material.materialCode,
        material.materialName,
        material.category,
        material.catNo,
        material.supplierName,
        material.supplierCode
      ].some(value => String(value || '').toLowerCase().includes(term));
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

  const handleEdit = (material) => {
    setSelectedMaterial(material);
    setFormData({
      materialFlow: material.materialFlow || '',
      class: material.class || '',
      category: material.category || '',
      materialName: material.materialName || '',
      catNo: material.catNo || '',
      hsnCode: material.hsnCode || '',
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
      hsnCode: '',
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
                <Search size={20} />
                <input
                  type="text"
                  placeholder="Search by code, name, category, cat no or supplier"
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

              <select
                className="cm-class-select"
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
              <div className="cm-result-count">
                Showing {filteredMaterials.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredMaterials.length)} of {filteredMaterials.length} materials
              </div>
            )}

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
                <div className="cm-table-wrap">
                  <table className="cm-table">
                    <thead>
                      <tr>
                        {COLUMNS.map(column => {
                          const active = sort.key === column.key;
                          const SortIcon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                          return (
                            <th
                              key={column.key}
                              className={`cm-th-sortable ${active ? 'cm-th-active' : ''} ${column.align === 'right' ? 'cm-right' : ''}`}
                              onClick={() => handleSort(column.key)}
                              aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <span>{column.label}</span>
                              <SortIcon size={14} />
                            </th>
                          );
                        })}
                        <th className="cm-th-action"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMaterials.map((material) => (
                        <tr key={material.id} onClick={() => handleEdit(material)}>
                          <td><span className="cm-code-pill">{material.materialCode || 'N/A'}</span></td>
                          <td className="cm-td-name">{material.materialName}</td>
                          <td>
                            <span className={`cm-flow-badge cm-flow-${material.materialFlow?.toLowerCase()}`}>
                              {material.materialFlow}
                            </span>
                          </td>
                          <td>{material.class || '-'}</td>
                          <td>{material.category || '-'}</td>
                          <td>{material.catNo || '-'}</td>
                          <td>{material.supplierName || '-'}</td>
                          <td>{material.unit || '-'}</td>
                          <td className="cm-right cm-td-cost">
                            <IndianRupee size={13} />
                            {material.costPerItem || '0'}
                          </td>
                          <td className="cm-td-action">
                            <button
                              className="cm-row-edit-btn"
                              onClick={(e) => { e.stopPropagation(); handleEdit(material); }}
                              title="Edit material"
                            >
                              <Pencil size={15} />
                              Edit
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
                        <label>HSN Code (used on invoices)</label>
                        <input
                          type="text"
                          name="hsnCode"
                          inputMode="numeric"
                          value={formData.hsnCode}
                          onChange={(e) => handleInputChange({ target: { name: 'hsnCode', value: e.target.value.replace(/\D/g, '').slice(0, 8) } })}
                          placeholder="4 to 8 digits"
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
