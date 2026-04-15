import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from 'rsuite';
import 'rsuite/dist/rsuite.min.css';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { StatusMessage } from '../../components/popup';
import '../../styles/pageStyles/Stock/CreateMaster.css';

const CreateMaster = () => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [generatedMaterialCode, setGeneratedMaterialCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  
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
    unit: 'EA'
  });

  const [gstError, setGstError] = useState({
    cgst: false,
    sgst: false,
    igst: false
  });

  const [supplierCodeError, setSupplierCodeError] = useState(false);
  const [primaryFieldError, setPrimaryFieldError] = useState({
    materialFlow: false,
    class: false,
    category: false,
    materialName: false
  });

  const [showGstError, setShowGstError] = useState(false);
  const [showRequiredError, setShowRequiredError] = useState(false);
  const [showPrimaryFieldError, setShowPrimaryFieldError] = useState(false);

  // Generate idempotency key on component mount
  useEffect(() => {
    const key = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setIdempotencyKey(key);
  }, []);

  const handleChange = (e) => {
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

    // Handle Material Flow change - auto-lock class to F when FIN is selected
    if (name === 'materialFlow') {
      // Clear primary field error for materialFlow
      setPrimaryFieldError(prev => ({ ...prev, materialFlow: false }));

      if (value === 'FIN') {
        setFormData(prev => ({
          ...prev,
          materialFlow: value,
          class: 'F' // Auto-lock class to F for FIN
        }));
        return;
      } else {
        // Reset class when switching away from FIN
        setFormData(prev => ({
          ...prev,
          materialFlow: value,
          class: ''
        }));
        return;
      }
    }

    // Handle primary fields and clear their errors
    if (name === 'class' || name === 'category' || name === 'materialName') {
      setPrimaryFieldError(prev => ({ ...prev, [name]: false }));
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
  }

  const handleSubmit = (e) => {
    e.preventDefault();

    // Check if required fields are empty (including unit)
    if (!formData.materialFlow || !formData.class || !formData.category || !formData.materialName || !formData.unit) {
      setShowRequiredError(true);
      setShowPrimaryFieldError(true);
      setShowGstError(false);

      // Set error states for empty primary fields
      setPrimaryFieldError({
        materialFlow: !formData.materialFlow,
        class: !formData.class,
        category: !formData.category,
        materialName: !formData.materialName
      });
      return;
    }

    // Check if any GST value exceeds 28
    if (gstError.cgst || gstError.sgst || gstError.igst) {
      setShowGstError(true);
      setShowRequiredError(false);
      setShowPrimaryFieldError(false);
      return;
    }

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    setShowGstError(false);
    setShowRequiredError(false);
    setShowPrimaryFieldError(false);
    setSubmitError('');
    
    const submitData = async () => {
      setIsSubmitting(true);
      try {
        const token = sessionStorage.getItem('token');
        
        if (!token) {
          setSubmitError('Please login to continue');
          setIsSubmitting(false);
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_API_URL}/master/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-idempotency-key': idempotencyKey // Send idempotency key
          },
          body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok || data.isDuplicate) {
          setShowGstError(false);
          setShowRequiredError(false);
          
          // Set the generated material code and show popup
          setGeneratedMaterialCode(data.master?.materialCode || data.materialCode || '');
          
          if (data.isDuplicate) {
            setSuccessMessage('Material already exists. Showing existing record.');
          } else {
            setSuccessMessage('Material master created successfully!');
          }
          
          setShowSuccessPopup(true);
          
          // Auto-hide popup after 3 seconds
          setTimeout(() => {
            setShowSuccessPopup(false);
            handleReset();
          }, 3000);
        } else {
          setSubmitError(data.message || data.error || 'Failed to create material master');
        }
      } catch (error) {
        console.error('Error creating material master:', error);
        setSubmitError('Failed to create material master. Please check your connection and try again.');
      } finally {
        setIsSubmitting(false);
      }
    };

    submitData();
  };

  const handleReset = () => {
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
      unit: 'EA'
    });

    // Reset error states
    setGstError({
      cgst: false,
      sgst: false,
      igst: false
    });

    setSupplierCodeError(false);
    setPrimaryFieldError({
      materialFlow: false,
      class: false,
      category: false,
      materialName: false
    });

    setShowGstError(false);
    setShowRequiredError(false);
    setShowPrimaryFieldError(false);
    setSubmitError('');
    
    // Generate a new idempotency key for the next submission
    const newKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setIdempotencyKey(newKey);
  };

  return (
    <div className="create-container">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Create Material" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />
      <div className="form-container">
            <form onSubmit={handleSubmit} className="master-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="materialFlow">Material Flow <span className="required">*</span></label>
                  <Dropdown
                    title={formData.materialFlow || "Select material flow"}
                    onSelect={(value) => handleChange({ target: { name: 'materialFlow', value } })}
                    className={`rsuite-dropdown ${primaryFieldError.materialFlow ? 'error-input' : ''}`}
                  >
                    <Dropdown.Item eventKey="BOM">BOM</Dropdown.Item>
                    <Dropdown.Item eventKey="FIN">FIN</Dropdown.Item>
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label htmlFor="class">Class <span className="required">*</span></label>
                  <Dropdown
                    title={formData.class || "Select class"}
                    onSelect={(value) => handleChange({ target: { name: 'class', value } })}
                    disabled={formData.materialFlow === 'FIN'}
                    className={`rsuite-dropdown ${primaryFieldError.class ? 'error-input' : ''} ${formData.materialFlow === 'FIN' ? 'disabled-dropdown' : ''}`}
                  >
                    <Dropdown.Item eventKey="A">A</Dropdown.Item>
                    <Dropdown.Item eventKey="B">B</Dropdown.Item>
                    <Dropdown.Item eventKey="C">C</Dropdown.Item>
                    <Dropdown.Item eventKey="D">D</Dropdown.Item>
                    {formData.materialFlow !== 'BOM' && (
                      <Dropdown.Item eventKey="F">F</Dropdown.Item>
                    )}
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label htmlFor="category">Category <span className="required">*</span></label>
                  <input
                    type="text"
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="Enter category"
                    required
                    className={`${primaryFieldError.category ? 'error-input' : ''}`}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="materialName">Material Name <span className="required">*</span></label>
                  <input
                    type="text"
                    id="materialName"
                    name="materialName"
                    value={formData.materialName}
                    onChange={handleChange}
                    placeholder="Enter material name"
                    required
                    className={`${primaryFieldError.materialName ? 'error-input' : ''}`}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="catNo">Catalog Number (CatNo)</label>
                  <input
                    type="text"
                    id="catNo"
                    name="catNo"
                    value={formData.catNo}
                    onChange={handleChange}
                    placeholder="Enter catalog number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="supplierName">Supplier Name</label>
                  <input
                    type="text"
                    id="supplierName"
                    name="supplierName"
                    value={formData.supplierName}
                    onChange={handleChange}
                    placeholder="Enter supplier name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="supplierCode">Supplier Code</label>
                  <input
                    type="text"
                    id="supplierCode"
                    name="supplierCode"
                    value={formData.supplierCode}
                    onChange={handleChange}
                    placeholder="Enter supplier code (max 3 digits)"
                    className={`${supplierCodeError ? 'error-input' : ''}`}
                  />
                </div>

                <div className="form-group">
                <label htmlFor="cgst">CGST (%)</label>
                <div className="input-with-icon">
                    <input
                      type="text"
                      id="cgst"
                      name="cgst"
                      value={formData.cgst}
                      onChange={handleChange}
                      placeholder="Enter CGST percentage"
                      disabled={formData.igst !== ''}
                      className={`${formData.igst !== '' ? 'disabled-input' : ''} ${gstError.cgst ? 'error-input' : ''}`}
                    />
                    {formData.igst !== '' && (
                      <svg className="lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="sgst">SGST (%)</label>
                  <div className="input-with-icon">
                    <input
                      type="text"
                      id="sgst"
                      name="sgst"
                      value={formData.sgst}
                      onChange={handleChange}
                      placeholder="Enter SGST percentage"
                      disabled={formData.igst !== ''}
                      className={`${formData.igst !== '' ? 'disabled-input' : ''} ${gstError.sgst ? 'error-input' : ''}`}
                    />
                    {formData.igst !== '' && (
                      <svg className="lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="igst">IGST (%)</label>
                  <div className="input-with-icon">
                    <input
                      type="text"
                      id="igst"
                      name="igst"
                      value={formData.igst}
                      onChange={handleChange}
                      placeholder="Enter IGST percentage"
                      disabled={formData.cgst !== '' || formData.sgst !== ''}
                      className={`${formData.cgst !== '' || formData.sgst !== '' ? 'disabled-input' : ''} ${gstError.igst ? 'error-input' : ''}`}
                    />
                    {(formData.cgst !== '' || formData.sgst !== '') && (
                      <svg className="lock-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="costPerItem">Cost per Item (₹)</label>
                  <input
                    type="text"
                    id="costPerItem"
                    name="costPerItem"
                    value={formData.costPerItem}
                    onChange={handleChange}
                    placeholder="Enter cost per item"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="unit">Unit <span className="required-asterisk">*</span></label>
                  <Dropdown
                    title={formData.unit ? `${formData.unit} (${formData.unit === 'EA' ? 'Each' : formData.unit === 'KG' ? 'Kilogram' : formData.unit === 'M' ? 'Meter' : 'Strip'})` : "Select unit"}
                    onSelect={(value) => handleChange({ target: { name: 'unit', value } })}
                    className="rsuite-dropdown"
                  >
                    <Dropdown.Item eventKey="EA">EA (Each)</Dropdown.Item>
                    <Dropdown.Item eventKey="KG">KG (Kilogram)</Dropdown.Item>
                    <Dropdown.Item eventKey="M">M (Meter)</Dropdown.Item>
                    <Dropdown.Item eventKey="ST">ST (Strip)</Dropdown.Item>
                  </Dropdown>
                </div>
              </div>

              <div className="form-actions">
                {showRequiredError && (
                  <div className="required-error-message">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>Please fill all required fields marked with *</span>
                  </div>
                )}
                {showGstError && (gstError.cgst || gstError.sgst || gstError.igst) && (
                  <div className="gst-error-message">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>GST values cannot exceed 28%</span>
                  </div>
                )}
                {submitError && (
                  <div className="submit-error-message" style={{ color: '#d32f2f', padding: '10px', marginBottom: '10px', borderRadius: '4px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', display: 'inline' }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>{submitError}</span>
                  </div>
                )}
                <button type="button" className="btn-reset" onClick={handleReset} disabled={isSubmitting}>
                  Reset
                </button>
                <button type="submit" className="btn-submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Material'}
                </button>
              </div>
            </form>
      </div>
      
      {showSuccessPopup && <StatusMessage message={successMessage || `Material Master Created ${generatedMaterialCode}`} />}
    </div>
  );
};

export default CreateMaster;
