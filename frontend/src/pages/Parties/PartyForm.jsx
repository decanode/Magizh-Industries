import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Save, Plus, Trash2 } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { PARTY_TYPES, partyApi } from './partyConfig';
import { INDIAN_STATES } from './indianStates';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  paymentTermsDays: '',
  addresses: []
};

const EMPTY_ADDRESS = { type: 'billing', label: '', name: '', gstin: '', line1: '', line2: '', city: '', state: '', pincode: '' };

// Create (no :id) and Change (with :id) share this form.
const PartyForm = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { type, id } = useParams();
  const party = PARTY_TYPES[type];
  const isEdit = Boolean(id);

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!party || !isEdit) return undefined;
    let cancelled = false;

    partyApi(type, `/${id}`)
      .then(({ item }) => {
        if (cancelled) return;
        setCode(item.code);
        setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map((field) => [field, item[field] ?? EMPTY_FORM[field]])));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [type, party, id, isEdit]);

  if (!party) return <Navigate to="/master-data" replace />;

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const updateAddress = (index, field, value) =>
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((address, i) => (i === index ? { ...address, [field]: value } : address))
    }));
  const addAddress = (type) =>
    setForm((current) => ({ ...current, addresses: [...current.addresses, { ...EMPTY_ADDRESS, type }] }));
  const removeAddress = (index) =>
    setForm((current) => ({ ...current, addresses: current.addresses.filter((_, i) => i !== index) }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    if (party.hasAddresses) {
      const incomplete = form.addresses.findIndex((address) => !address.line1.trim() || !address.state);
      if (incomplete >= 0) {
        setError(`Address ${incomplete + 1}: enter the address line and choose a state`);
        return;
      }
    }

    setSaving(true);
    try {
      await partyApi(type, isEdit ? `/${id}` : '', { method: isEdit ? 'PUT' : 'POST', body: form });
      navigate(isEdit ? `${party.route}/change` : party.route);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const field = (name, label, props = {}) => (
    <label>
      {label}
      <input value={form[name]} onChange={(e) => updateField(name, e.target.value)} {...props} />
    </label>
  );

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar
        title={isEdit ? `Change ${party.label}` : `Create ${party.label}`}
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          {error && <div className="em-error">{error}</div>}

          {loading ? (
            <p className="em-muted">Loading {party.label.toLowerCase()}...</p>
          ) : (
            <form className="em-form" onSubmit={handleSubmit}>
              <section className="em-section">
                <h3>{party.label} details</h3>
                {isEdit ? (
                  <p className="em-muted">Code: {code}</p>
                ) : (
                  <p className="em-muted">The {party.label.toLowerCase()} code is assigned automatically on save.</p>
                )}
                <div className="em-grid">
                  {field('name', `${party.label} name *`)}
                  {field('contactPerson', 'Contact person')}
                  {field('phone', 'Phone', { inputMode: 'tel' })}
                  {field('email', 'Email', { type: 'email' })}
                  {field('gstin', 'GSTIN', { maxLength: 15 })}
                </div>
              </section>

              {party.hasAddresses ? (
                <>
                  <section className="em-section">
                    <h3>Payment</h3>
                    <div className="em-grid">
                      {field('paymentTermsDays', 'Payment terms (days)', { inputMode: 'numeric', placeholder: 'e.g. 45' })}
                    </div>
                  </section>

                  <section className="em-section">
                    <h3>Addresses</h3>
                    <p className="em-muted">
                      Add the addresses this customer bills to and ships to. They are chosen separately on each sales order.
                    </p>
                    {form.addresses.map((address, index) => (
                      <fieldset key={address.id || index} className="em-fieldset party-address">
                        <div className="em-grid">
                          <label>
                            Type
                            <select value={address.type} onChange={(e) => updateAddress(index, 'type', e.target.value)}>
                              <option value="billing">Bill-to</option>
                              <option value="shipping">Ship-to</option>
                            </select>
                          </label>
                          <label>
                            Label
                            <input
                              value={address.label}
                              placeholder="e.g. Head office, Plant 2"
                              onChange={(e) => updateAddress(index, 'label', e.target.value)}
                            />
                          </label>
                          <label>
                            Name on documents
                            <input
                              value={address.name || ''}
                              placeholder="Leave blank to use the customer's name"
                              onChange={(e) => updateAddress(index, 'name', e.target.value)}
                            />
                          </label>
                          <label>
                            GSTIN
                            <input
                              value={address.gstin || ''}
                              maxLength={15}
                              placeholder="Only if different from the customer's"
                              onChange={(e) => updateAddress(index, 'gstin', e.target.value.toUpperCase())}
                            />
                          </label>
                          <label>
                            Address line 1 *
                            <input value={address.line1} onChange={(e) => updateAddress(index, 'line1', e.target.value)} />
                          </label>
                          <label>
                            Address line 2
                            <input value={address.line2} onChange={(e) => updateAddress(index, 'line2', e.target.value)} />
                          </label>
                          <label>
                            City
                            <input value={address.city} onChange={(e) => updateAddress(index, 'city', e.target.value)} />
                          </label>
                          <label>
                            State *
                            <select value={address.state} onChange={(e) => updateAddress(index, 'state', e.target.value)}>
                              <option value="">Select state</option>
                              {INDIAN_STATES.map((state) => (
                                <option key={state} value={state}>{state}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Pincode
                            <input
                              inputMode="numeric"
                              maxLength={6}
                              value={address.pincode}
                              onChange={(e) => updateAddress(index, 'pincode', e.target.value)}
                            />
                          </label>
                        </div>
                        <button type="button" className="em-secondary-btn em-danger-btn party-address-remove" onClick={() => removeAddress(index)}>
                          <Trash2 size={16} />
                          Remove address
                        </button>
                      </fieldset>
                    ))}
                    <div className="em-actions party-address-actions">
                      <button type="button" className="em-secondary-btn" onClick={() => addAddress('billing')}>
                        <Plus size={16} /> Add bill-to address
                      </button>
                      <button type="button" className="em-secondary-btn" onClick={() => addAddress('shipping')}>
                        <Plus size={16} /> Add ship-to address
                      </button>
                    </div>
                  </section>
                </>
              ) : (
              <section className="em-section">
                <h3>Address</h3>
                <div className="em-grid">
                  {field('address', 'Address')}
                  {field('city', 'City')}
                  {field('state', 'State')}
                  {field('pincode', 'Pincode', { inputMode: 'numeric', maxLength: 6 })}
                </div>
              </section>
              )}

              <div className="em-actions">
                <button
                  type="button"
                  className="em-secondary-btn"
                  onClick={() => navigate(isEdit ? `${party.route}/change` : party.route)}
                >
                  Cancel
                </button>
                <button type="submit" className="em-primary-btn" disabled={saving}>
                  <Save size={18} />
                  {saving ? 'Saving...' : `Save ${party.label.toLowerCase()}`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartyForm;
