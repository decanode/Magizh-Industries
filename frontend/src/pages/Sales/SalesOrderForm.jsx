import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Plus, Trash2, Ban, Truck, PackageCheck } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import Popup from '../../components/popup';
import SearchSelect from '../../components/SearchSelect';
import { salesApi, deliveryApi, fetchCustomers, fetchCustomer, formatMoney, formatAddress, formatDate, deliveryState } from './salesApi';
import { taxTypeForState, previewTotals } from './pricing';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

const todayLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const emptyLine = () => ({ key: crypto.randomUUID(), materialId: '', quantity: '', unitPrice: '' });

const EMPTY_FORM = {
  billToId: '',
  shipToId: '',
  taxType: '', // '' means automatic, from the bill-to state
  orderDate: todayLocal(),
  customerPoNumber: '',
  quotationNumber: '',
  customerPoDate: '',
  expectedDeliveryDate: '',
  paymentTermsDays: '45',
  notes: ''
};

// Create a sales order, or view/change/cancel an existing one (route has an :id).
const SalesOrderForm = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isExisting = Boolean(id);

  // One key per form: if a save is sent twice (double click, retry), the server creates only one order
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shortages, setShortages] = useState([]);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCloseBalance, setShowCloseBalance] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [deliveries, setDeliveries] = useState([]);

  // Cancelled orders are read-only. Once goods are delivered only prices, dates and notes can change.
  const readOnly = isExisting && order?.status === 'Cancelled';
  const partlyLocked = isExisting && ['In Delivery', 'Delivered'].includes(order?.status);
  const canDeliver = isExisting && ['Open', 'In Delivery'].includes(order?.status) && !customer?.archived;

  const applyOrder = (loaded, loadedCustomer) => {
    setOrder(loaded);
    setCustomer(loadedCustomer);
    setForm({
      billToId: loaded.billTo.id,
      shipToId: loaded.shipTo.id,
      taxType: loaded.taxType,
      orderDate: loaded.orderDate,
      customerPoNumber: loaded.customerPoNumber,
      quotationNumber: loaded.quotationNumber || '',
      customerPoDate: loaded.customerPoDate,
      expectedDeliveryDate: loaded.expectedDeliveryDate,
      paymentTermsDays: String(loaded.paymentTermsDays),
      notes: loaded.notes
    });
    setLines(loaded.lines.map((line) => ({
      key: crypto.randomUUID(),
      materialId: line.materialId,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice)
    })));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [materialData, loaded] = await Promise.all([
          salesApi('/materials'),
          isExisting ? salesApi(`/${id}`) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        setMaterials(materialData.items);

        if (loaded) {
          const [loadedCustomer, deliveryData] = await Promise.all([
            fetchCustomer(loaded.item.customerId),
            deliveryApi(`?salesOrderId=${id}&pageSize=50`)
          ]);
          if (!cancelled) {
            applyOrder(loaded.item, loadedCustomer);
            setDeliveries(deliveryData.items);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, isExisting]);

  const billingAddresses = (customer?.addresses || []).filter((address) => address.type === 'billing');
  const shippingAddresses = (customer?.addresses || []).filter((address) => address.type === 'shipping');
  const billTo = billingAddresses.find((address) => address.id === form.billToId);
  const autoTaxType = billTo ? taxTypeForState(billTo.state) : 'INTRA';
  const taxType = form.taxType || autoTaxType;

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const chooseCustomer = (selected) => {
    const billing = (selected.addresses || []).filter((address) => address.type === 'billing');
    const shipping = (selected.addresses || []).filter((address) => address.type === 'shipping');
    setCustomer(selected);
    setForm((current) => ({
      ...current,
      // Preselect when there is only one choice, otherwise make the user pick
      billToId: billing.length === 1 ? billing[0].id : '',
      shipToId: shipping.length === 1 ? shipping[0].id : '',
      taxType: '',
      paymentTermsDays: String(selected.paymentTermsDays || 45)
    }));
  };

  // Look a line's material up, falling back to what the saved order recorded if it is no longer sellable
  const materialOf = (line) => {
    const found = materials.find((material) => material.id === line.materialId);
    if (found) return found;
    const saved = order?.lines.find((entry) => entry.materialId === line.materialId);
    return saved && {
      id: saved.materialId, materialCode: saved.materialCode, materialName: saved.materialName, catNo: saved.catNo,
      unit: saved.unit, igst: String(saved.gstRate), cgst: '', sgst: '', unitPrice: saved.unitPrice, available: 0
    };
  };

  // Stock this line can use. On a saved order the order's own quantity is already taken out of stock, so it counts as available again.
  const availableFor = (line) => {
    const material = materialOf(line);
    if (!material) return 0;
    const ownQuantity = order && order.status !== 'Cancelled' ? order.lines.find((entry) => entry.materialId === line.materialId)?.quantity || 0 : 0;
    return material.available + ownQuantity;
  };

  const updateLine = (key, changes) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));
  const removeLine = (key) => setLines((current) => (current.length === 1 ? [emptyLine()] : current.filter((line) => line.key !== key)));

  const chooseMaterial = (key, material) => updateLine(key, { materialId: material.id, unitPrice: String(material.unitPrice) });

  const lineProblems = useMemo(() => {
    const problems = {};
    lines.forEach((line) => {
      const material = materialOf(line);
      const quantity = Number(line.quantity);
      if (material && quantity > availableFor(line) + 1e-9) {
        problems[line.key] = `Only ${availableFor(line)} ${material.unit} in stock`;
      }
    });
    return problems;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, materials, order]);

  const totals = useMemo(() => {
    const priced = lines
      .map((line) => ({ material: materialOf(line), quantity: line.quantity, unitPrice: line.unitPrice }))
      .filter((line) => line.material && Number(line.quantity) > 0);
    return previewTotals(priced, taxType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, materials, taxType, order]);

  const validate = () => {
    if (!customer) return 'Select a customer';
    if (!form.billToId) return 'Select a bill-to address';
    if (!form.shipToId) return 'Select a ship-to address';
    if (!lines.some((line) => line.materialId)) return 'Add at least one material';

    for (const [index, line] of lines.entries()) {
      const label = `Line ${index + 1}`;
      if (!line.materialId) return `${label}: select a material or remove the line`;
      if (!(Number(line.quantity) > 0)) return `${label}: enter a quantity`;
      if (line.unitPrice === '' || Number(line.unitPrice) < 0) return `${label}: enter a price`;
      if (lineProblems[line.key]) return `${label}: ${lineProblems[line.key]}`;
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setShortages([]);

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    const body = {
      customerId: customer.id,
      billToId: form.billToId,
      shipToId: form.shipToId,
      taxType: form.taxType || undefined,
      orderDate: form.orderDate,
      customerPoNumber: form.customerPoNumber,
      quotationNumber: form.quotationNumber,
      customerPoDate: form.customerPoDate,
      expectedDeliveryDate: form.expectedDeliveryDate,
      paymentTermsDays: Number(form.paymentTermsDays),
      notes: form.notes,
      lines: lines.map((line) => ({
        materialId: line.materialId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice)
      }))
    };

    setSaving(true);
    try {
      if (isExisting) {
        const data = await salesApi(`/${id}`, { method: 'PUT', body: { ...body, version: order.version } });
        const [materialData] = await Promise.all([salesApi('/materials')]);
        setMaterials(materialData.items);
        applyOrder(data.item, customer);
        setSaving(false);
      } else {
        await salesApi('', { method: 'POST', body, headers: { 'X-Idempotency-Key': idempotencyKey } });
        navigate('/sales/orders');
      }
    } catch (err) {
      setError(err.message);
      if (err.code === 'INSUFFICIENT_STOCK') {
        setShortages(err.details || []);
        // Stock may have changed since the page loaded - refresh the figures shown
        salesApi('/materials').then((data) => setMaterials(data.items)).catch(() => {});
      }
      setSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    try {
      const data = await salesApi(`/${id}/cancel`, { method: 'POST', body: { reason: cancelReason } });
      setShowCancel(false);
      setCancelReason('');
      applyOrder(data.item, customer);
    } catch (err) {
      setShowCancel(false);
      setError(err.message);
    }
  };

  const handleCloseBalance = async () => {
    if (!closeReason.trim()) return;
    try {
      const data = await salesApi(`/${id}/close-balance`, { method: 'POST', body: { reason: closeReason } });
      setShowCloseBalance(false);
      setCloseReason('');
      applyOrder(data.item, customer);
      salesApi('/materials').then((result) => setMaterials(result.items)).catch(() => {});
    } catch (err) {
      setShowCloseBalance(false);
      setError(err.message);
    }
  };

  const title = isExisting ? (order ? order.soNumber : 'Sales Order') : 'New Sales Order';

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title={title} onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          {error && (
            <div className="em-error">
              {error}
              {shortages.length > 0 && (
                <ul className="so-shortages">
                  {shortages.map((item) => (
                    <li key={item.materialCode}>
                      {item.materialName} ({item.materialCode}): requested {item.requested}, available {item.available}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {readOnly && order && (
            <div className="em-exit-banner">
              This order is cancelled and can no longer be changed.
              {order.cancelReason && <> Reason: {order.cancelReason}</>}
            </div>
          )}
          {customer?.archived && (
            <div className="em-exit-banner so-info-banner">
              This customer has been archived. You can still view this record, but changing the order or creating deliveries is blocked until the customer is restored.
            </div>
          )}
          {partlyLocked && (
            <div className="em-exit-banner so-info-banner">
              Goods have been delivered against this order, so only prices, dates and notes can change.
            </div>
          )}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : (
            <form className="em-form so-form" onSubmit={handleSubmit}>
              <fieldset disabled={readOnly || saving} className="so-fieldset">
                <section className="em-section">
                  <h3>Customer</h3>
                  <div className="em-grid">
                    <label>
                      Customer *
                      <SearchSelect
                        options={customerOptions}
                        selectedLabel={customer ? `${customer.code} - ${customer.name}` : ''}
                        placeholder="Search customer by name or code"
                        disabled={isExisting}
                        onQueryChange={(query) => fetchCustomers(query).then(setCustomerOptions).catch(() => setCustomerOptions([]))}
                        onSelect={chooseCustomer}
                        getKey={(option) => option.id}
                        renderOption={(option) => <>{option.code} - {option.name}{option.city ? ` (${option.city})` : ''}</>}
                      />
                    </label>
                    <label>
                      Order date *
                      <input type="date" value={form.orderDate} onChange={(e) => updateField('orderDate', e.target.value)} />
                    </label>
                    <label>
                      Customer PO number
                      <input value={form.customerPoNumber} onChange={(e) => updateField('customerPoNumber', e.target.value)} />
                    </label>
                    <label>
                      HALB
                      <input
                        value={form.quotationNumber}
                        maxLength={50}
                        placeholder="Customer quotation number"
                        onChange={(e) => updateField('quotationNumber', e.target.value)}
                      />
                    </label>
                    <label>
                      Customer PO date
                      <input type="date" value={form.customerPoDate} onChange={(e) => updateField('customerPoDate', e.target.value)} />
                    </label>
                    <label>
                      Expected delivery date
                      <input type="date" value={form.expectedDeliveryDate} onChange={(e) => updateField('expectedDeliveryDate', e.target.value)} />
                    </label>
                    <label>
                      Payment terms (days)
                      <input inputMode="numeric" value={form.paymentTermsDays} onChange={(e) => updateField('paymentTermsDays', e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="em-section">
                  <h3>Addresses</h3>
                  {customer && (billingAddresses.length === 0 || shippingAddresses.length === 0) && (
                    <p className="em-error">
                      This customer needs at least one {billingAddresses.length === 0 ? 'bill-to' : ''}
                      {billingAddresses.length === 0 && shippingAddresses.length === 0 ? ' and one ' : ''}
                      {shippingAddresses.length === 0 ? 'ship-to' : ''} address. Add it in Master Data, then Customer Master, then Change.
                    </p>
                  )}
                  <div className="em-grid so-address-grid">
                    <label>
                      Bill-to address *
                      <select value={form.billToId} disabled={!customer || partlyLocked} onChange={(e) => setForm((current) => ({ ...current, billToId: e.target.value, taxType: '' }))}>
                        <option value="">{customer ? 'Select bill-to address' : 'Select a customer first'}</option>
                        {billingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>{formatAddress(address)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ship-to address *
                      <select value={form.shipToId} disabled={!customer} onChange={(e) => updateField('shipToId', e.target.value)}>
                        <option value="">{customer ? 'Select ship-to address' : 'Select a customer first'}</option>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>{formatAddress(address)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      GST type
                      <select value={form.taxType} disabled={partlyLocked} onChange={(e) => updateField('taxType', e.target.value)}>
                        <option value="">Automatic ({autoTaxType === 'INTRA' ? 'CGST + SGST' : 'IGST'})</option>
                        <option value="INTRA">CGST + SGST (within Tamil Nadu)</option>
                        <option value="INTER">IGST (other states)</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="em-section">
                  <h3>Materials</h3>
                  <div className="em-table-wrap">
                    <table className="em-table so-lines">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th className="so-col-material">Material</th>
                          <th>In stock</th>
                          <th>Quantity</th>
                          {isExisting && <th>Delivered</th>}
                          <th>Price (₹)</th>
                          <th>GST %</th>
                          <th className="so-right">Amount (₹)</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const material = materialOf(line);
                          const amount = material ? (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) : 0;
                          return (
                            <tr key={line.key} className={lineProblems[line.key] ? 'so-line-problem' : ''}>
                              <td>{index + 1}</td>
                              <td className="so-col-material">
                                <SearchSelect
                                  disabled={partlyLocked}
                                  options={materials}
                                  selectedLabel={material ? `${material.materialCode} - ${material.materialName}` : ''}
                                  placeholder="Search code, name or cat no"
                                  matches={(option, query) =>
                                    [option.materialCode, option.materialName, option.catNo].some((value) => String(value || '').toLowerCase().includes(query))
                                  }
                                  onSelect={(option) => chooseMaterial(line.key, option)}
                                  getKey={(option) => option.id}
                                  renderOption={(option) => (
                                    <span className="so-material-option">
                                      <span>{option.materialCode} - {option.materialName}</span>
                                      <small>{option.catNo ? `Cat ${option.catNo} · ` : ''}stock {option.available} {option.unit}</small>
                                    </span>
                                  )}
                                />
                              </td>
                              <td className={material ? '' : 'so-muted'}>{material ? `${availableFor(line)} ${material.unit}` : '-'}</td>
                              <td>
                                <input
                                  className="so-number"
                                  inputMode="decimal"
                                  disabled={partlyLocked}
                                  value={line.quantity}
                                  onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && updateLine(line.key, { quantity: e.target.value })}
                                />
                                {lineProblems[line.key] && <div className="so-line-error">{lineProblems[line.key]}</div>}
                              </td>
                              {isExisting && (
                                <td>{order?.lines.find((entry) => entry.materialId === line.materialId)?.deliveredQty ?? 0}</td>
                              )}
                              <td>
                                <input
                                  className="so-number"
                                  inputMode="decimal"
                                  value={line.unitPrice}
                                  onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && updateLine(line.key, { unitPrice: e.target.value })}
                                />
                              </td>
                              <td>{material ? (parseFloat(material.igst) > 0 ? parseFloat(material.igst) : (parseFloat(material.cgst) || 0) + (parseFloat(material.sgst) || 0)) : '-'}</td>
                              <td className="so-right">{formatMoney(amount)}</td>
                              <td>
                                <button type="button" className="em-icon-btn" title="Remove line" disabled={partlyLocked} onClick={() => removeLine(line.key)}>
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="em-secondary-btn so-add-line" hidden={partlyLocked} onClick={() => setLines((current) => [...current, emptyLine()])}>
                    <Plus size={16} /> Add material
                  </button>
                </section>

                <section className="em-section so-totals-section">
                  <label className="so-notes">
                    Notes
                    <textarea rows={3} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
                  </label>
                  <table className="so-totals">
                    <tbody>
                      <tr><td>Subtotal</td><td>{formatMoney(totals.subtotal)}</td></tr>
                      {taxType === 'INTER' ? (
                        <tr><td>IGST</td><td>{formatMoney(totals.igst)}</td></tr>
                      ) : (
                        <>
                          <tr><td>CGST</td><td>{formatMoney(totals.cgst)}</td></tr>
                          <tr><td>SGST</td><td>{formatMoney(totals.sgst)}</td></tr>
                        </>
                      )}
                      <tr className="so-grand"><td>Total (₹)</td><td>{formatMoney(totals.grandTotal)}</td></tr>
                    </tbody>
                  </table>
                </section>
              </fieldset>

              <div className="em-actions">
                <button type="button" className="em-secondary-btn" onClick={() => navigate('/sales/orders')}>
                  Back
                </button>
                {canDeliver && (
                  <button type="button" className="em-secondary-btn" onClick={() => navigate(`/sales/orders/${id}/deliveries/new`)}>
                    <Truck size={18} />
                    Create delivery
                  </button>
                )}
                {isExisting && order?.status === 'In Delivery' && (
                  <button type="button" className="em-secondary-btn" onClick={() => setShowCloseBalance(true)}>
                    <PackageCheck size={18} />
                    Close undelivered balance
                  </button>
                )}
                {isExisting && order?.status === 'Open' && (
                  <button type="button" className="em-secondary-btn em-danger-btn" onClick={() => setShowCancel(true)}>
                    <Ban size={18} />
                    Cancel order
                  </button>
                )}
                {!readOnly && (
                  <button type="submit" className="em-primary-btn" disabled={saving}>
                    <Save size={18} />
                    {saving ? 'Saving...' : isExisting ? 'Save changes' : 'Create sales order'}
                  </button>
                )}
              </div>

              {isExisting && deliveries.length > 0 && (
                <section className="em-section">
                  <h3>Deliveries</h3>
                  <div className="em-table-wrap">
                    <table className="em-table">
                      <thead>
                        <tr><th>Delivery No</th><th>Date</th><th>Ship-to</th><th>Total (₹)</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {deliveries.map((delivery) => {
                          const state = deliveryState(delivery);
                          return (
                            <tr key={delivery.id} className="em-clickable" onClick={() => navigate(`/sales/deliveries/${delivery.id}`)}>
                              <td className="em-code">{delivery.dcNumber}</td>
                              <td>{formatDate(delivery.deliveryDate)}</td>
                              <td>{delivery.shipTo?.label || delivery.shipTo?.city}</td>
                              <td>{formatMoney(delivery.totals?.grandTotal)}</td>
                              <td><span className={`em-status ${state.tone}`}>{state.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {isExisting && order?.history?.length > 0 && (
                <section className="em-section">
                  <h3>History</h3>
                  <ul className="so-history">
                    {[...order.history].reverse().map((entry, index) => (
                      <li key={index}>
                        {new Date(entry.at).toLocaleString('en-IN')} - {entry.action} by {entry.by}
                        {entry.note ? ` (${entry.note})` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </form>
          )}
        </div>
      </div>

      <Popup
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancelOrder}
        title="Cancel sales order"
        message="The reserved stock goes back to inventory. This cannot be undone."
        type="danger"
        confirmText="Cancel order"
        cancelText="Keep order"
      >
        <textarea
          className="so-cancel-reason"
          rows={3}
          placeholder="Reason for cancelling (required)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Popup>

      <Popup
        isOpen={showCloseBalance}
        onClose={() => setShowCloseBalance(false)}
        onConfirm={handleCloseBalance}
        title="Close undelivered balance"
        message="The order shrinks to what has been delivered and the rest goes back to stock. This cannot be undone."
        type="warning"
        confirmText="Close balance"
        cancelText="Keep open"
      >
        <textarea
          className="so-cancel-reason"
          rows={3}
          placeholder="Reason (required)"
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
        />
      </Popup>
    </div>
  );
};

export default SalesOrderForm;
