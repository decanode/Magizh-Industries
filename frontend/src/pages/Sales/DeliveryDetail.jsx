import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Ban, BadgeCheck, BadgeX, FileText, Printer, FileDown } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import Popup from '../../components/popup';
import { deliveryApi, invoiceApi, openPdf, fetchCustomer, formatMoney, formatAddress, deliveryState } from './salesApi';
import { previewTotals } from './pricing';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

const DETAIL_FIELDS = ['shipToId', 'deliveryDate', 'vehicleNumber', 'transporter', 'ewayBillNumber', 'notes'];

// View a delivery, edit its transport details and prices, record the customer's costing confirmation, or cancel it.
const DeliveryDetail = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [delivery, setDelivery] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({});
  const [prices, setPrices] = useState({});
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTerms, setInvoiceTerms] = useState('');
  const [invoiceMissing, setInvoiceMissing] = useState([]);
  const [invoiceKey, setInvoiceKey] = useState(() => crypto.randomUUID());
  const [invoiceLines, setInvoiceLines] = useState({});

  const applyDelivery = (loaded) => {
    setDelivery(loaded);
    setForm({
      shipToId: loaded.shipTo.id,
      deliveryDate: loaded.deliveryDate,
      vehicleNumber: loaded.vehicleNumber,
      transporter: loaded.transporter,
      ewayBillNumber: loaded.ewayBillNumber,
      notes: loaded.notes
    });
    setPrices(Object.fromEntries(loaded.lines.map((line) => [line.soLineNo, String(line.unitPrice)])));
    setReference(loaded.costingReference || '');
  };

  useEffect(() => {
    let cancelled = false;

    deliveryApi(`/${id}`)
      .then(async ({ item }) => {
        const loadedCustomer = await fetchCustomer(item.customerId);
        if (cancelled) return;
        setCustomer(loadedCustomer);
        applyDelivery(item);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id]);

  const editable = delivery?.status === 'Created' && !delivery?.invoiceId;
  const pricesLocked = !editable || delivery?.costingConfirmed;
  const shippingAddresses = (customer?.addresses || []).filter((address) => address.type === 'shipping');

  const pricesChanged = delivery?.lines.some((line) => Number(prices[line.soLineNo]) !== line.unitPrice);
  const detailsChanged = delivery && DETAIL_FIELDS.some((field) => form[field] !== (field === 'shipToId' ? delivery.shipTo.id : delivery[field]));
  const dirty = pricesChanged || detailsChanged;

  const totals = useMemo(() => {
    if (!delivery) return null;
    return previewTotals(
      delivery.lines.map((line) => ({ material: { igst: line.gstRate }, quantity: line.quantity, unitPrice: prices[line.soLineNo] })),
      delivery.taxType
    );
  }, [delivery, prices]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    if (delivery.lines.some((line) => prices[line.soLineNo] === '')) {
      setError('Enter a price for every item');
      return;
    }

    setSaving(true);
    try {
      const { item } = await deliveryApi(`/${id}`, {
        method: 'PUT',
        body: {
          ...form,
          version: delivery.version,
          lines: delivery.lines.map((line) => ({ soLineNo: line.soLineNo, unitPrice: Number(prices[line.soLineNo]) }))
        }
      });
      applyDelivery(item);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setCostingConfirmation = async (confirmed) => {
    setError('');
    setSaving(true);
    try {
      const { item } = await deliveryApi(`/${id}/costing`, { method: 'POST', body: { confirmed, reference } });
      applyDelivery(item);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    try {
      const { item } = await deliveryApi(`/${id}/cancel`, { method: 'POST', body: { reason: cancelReason } });
      setShowCancel(false);
      setCancelReason('');
      applyDelivery(item);
    } catch (err) {
      setShowCancel(false);
      setError(err.message);
    }
  };

  const openInvoiceDialog = () => {
    const now = new Date();
    setInvoiceDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    setInvoiceTerms(String(delivery.paymentTermsDays));
    setInvoiceLines(Object.fromEntries(delivery.lines.map((line) => [line.soLineNo, { description: '', hsnCode: '' }])));
    setInvoiceMissing([]);
    setShowInvoice(true);
  };

  const handleCreateInvoice = async () => {
    setError('');
    setInvoiceMissing([]);
    setSaving(true);
    try {
      const { item } = await invoiceApi(`/from-delivery/${id}`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': invoiceKey },
        body: {
          invoiceDate,
          paymentTermsDays: invoiceTerms === '' ? undefined : Number(invoiceTerms),
          // Only what was typed is sent; blank means the material's name and the HSN in the material master
          lines: delivery.lines.map((line) => ({ soLineNo: line.soLineNo, ...invoiceLines[line.soLineNo] }))
        }
      });
      navigate(`/sales/invoices/${item.id}`);
    } catch (err) {
      // The same key must not be reused for a different attempt after a failure that changed nothing, but it is
      // safe to keep: the server only remembers keys of invoices it actually created.
      setError(err.message);
      if (err.code === 'MISSING_HSN') setInvoiceMissing(err.details || []);
      setShowInvoice(false);
      setInvoiceKey(crypto.randomUUID());
      setSaving(false);
    }
  };

  const handlePdf = async (print) => {
    setError('');
    try {
      await openPdf(`/deliveries/${id}/pdf`, { print });
    } catch (err) {
      setError(err.message);
    }
  };

  const state = delivery && deliveryState(delivery);

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title={delivery ? delivery.dcNumber : 'Delivery'} onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          {error && (
            <div className="em-error">
              {error}
              {invoiceMissing.length > 0 && (
                <ul className="so-shortages">
                  {invoiceMissing.map((item) => (
                    <li key={item.materialCode}>{item.materialName} ({item.materialCode})</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {customer?.archived && (
            <div className="em-exit-banner so-info-banner">
              This customer has been archived. You can still view this record, but changing the ship-to address is blocked until the customer is restored.
            </div>
          )}
          {delivery?.status === 'Cancelled' && (
            <div className="em-exit-banner">This delivery is cancelled. Reason: {delivery.cancelReason}</div>
          )}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : !delivery ? null : (
            <form className="em-form so-form" onSubmit={handleSave}>
              <section className="em-section">
                <h3>
                  {delivery.dcNumber} <span className={`em-status ${state.tone}`}>{state.label}</span>
                </h3>
                <p className="em-muted">
                  Order{' '}
                  <button type="button" className="so-link" onClick={() => navigate(`/sales/orders/${delivery.salesOrderId}`)}>
                    {delivery.soNumber}
                  </button>
                  {' '}| Customer: {delivery.customer.code} - {delivery.customer.name} | Bill-to: {formatAddress(delivery.billTo)}
                </p>
              </section>

              <fieldset disabled={!editable || saving} className="so-fieldset">
                <section className="em-section">
                  <h3>Delivery details</h3>
                  <div className="em-grid so-address-grid">
                    <label>
                      Ship-to address
                      <select value={form.shipToId} onChange={(e) => updateField('shipToId', e.target.value)}>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>{formatAddress(address)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Delivery date
                      <input type="date" value={form.deliveryDate} onChange={(e) => updateField('deliveryDate', e.target.value)} />
                    </label>
                    <label>
                      Vehicle number
                      <input value={form.vehicleNumber} onChange={(e) => updateField('vehicleNumber', e.target.value)} />
                    </label>
                    <label>
                      Transporter
                      <input value={form.transporter} onChange={(e) => updateField('transporter', e.target.value)} />
                    </label>
                    <label>
                      E-way bill number
                      <input value={form.ewayBillNumber} onChange={(e) => updateField('ewayBillNumber', e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="em-section">
                  <h3>Items</h3>
                  {delivery.costingConfirmed && (
                    <p className="em-muted">Prices are locked because the customer has confirmed the costing. Remove the confirmation to change them.</p>
                  )}
                  <div className="em-table-wrap">
                    <table className="em-table so-lines">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th className="so-col-material">Material</th>
                          <th>Quantity</th>
                          <th>Price (₹)</th>
                          <th>GST %</th>
                          <th className="so-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delivery.lines.map((line) => (
                          <tr key={line.soLineNo}>
                            <td>{line.lineNo}</td>
                            <td className="so-col-material">{line.materialCode} - {line.materialName}</td>
                            <td>{line.quantity} {line.unit}</td>
                            <td>
                              <input
                                className="so-number"
                                inputMode="decimal"
                                disabled={pricesLocked}
                                value={prices[line.soLineNo] ?? ''}
                                onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setPrices((current) => ({ ...current, [line.soLineNo]: e.target.value }))}
                              />
                            </td>
                            <td>{line.gstRate}</td>
                            <td className="so-right">{formatMoney(line.quantity * (Number(prices[line.soLineNo]) || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="em-section so-totals-section">
                  <label className="so-notes">
                    Notes
                    <textarea rows={3} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
                  </label>
                  <table className="so-totals">
                    <tbody>
                      <tr><td>Subtotal</td><td>{formatMoney(totals.subtotal)}</td></tr>
                      {delivery.taxType === 'INTER' ? (
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

              {delivery.status === 'Created' && (
                <section className="em-section so-costing">
                  <h3>Customer costing confirmation</h3>
                  <p className="em-muted">
                    The delivery challan only carries transport values. Once the customer approves the final costing, record it here -
                    an invoice cannot be created before that.
                  </p>
                  {delivery.costingConfirmed ? (
                    <p>
                      Confirmed on {new Date(delivery.costingConfirmedAt).toLocaleString('en-IN')} by {delivery.costingConfirmedBy}
                      {delivery.costingReference ? ` - ${delivery.costingReference}` : ''}
                    </p>
                  ) : null}
                  <div className="em-grid">
                    <label>
                      Reference (for example the approval email or date)
                      <input
                        value={reference}
                        disabled={delivery.costingConfirmed || !editable || saving}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </label>
                  </div>
                  {delivery.costingConfirmed ? (
                    <button type="button" className="em-secondary-btn so-costing-btn" disabled={!editable || saving} onClick={() => setCostingConfirmation(false)}>
                      <BadgeX size={18} />
                      Remove confirmation
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="em-primary-btn so-costing-btn"
                      disabled={!editable || saving || dirty}
                      title={dirty ? 'Save your changes first' : ''}
                      onClick={() => setCostingConfirmation(true)}
                    >
                      <BadgeCheck size={18} />
                      Mark costing as confirmed
                    </button>
                  )}
                  {dirty && !delivery.costingConfirmed && <p className="em-muted">Save your changes before confirming the costing.</p>}
                </section>
              )}

              {delivery.status === 'Created' && (
                <section className="em-section so-costing">
                  <h3>Invoice</h3>
                  {delivery.invoiceId ? (
                    <p>
                      Invoiced as{' '}
                      <button type="button" className="so-link" onClick={() => navigate(`/sales/invoices/${delivery.invoiceId}`)}>
                        {delivery.invoiceNumber}
                      </button>
                      . This delivery is locked while the invoice is active.
                    </p>
                  ) : (
                    <>
                      <p className="em-muted">
                        {delivery.costingConfirmed
                          ? 'The costing is confirmed, so the invoice can be created.'
                          : 'An invoice can only be created after the customer has confirmed the costing.'}
                      </p>
                      <button
                        type="button"
                        className="em-primary-btn"
                        disabled={!delivery.costingConfirmed || saving || dirty}
                        title={!delivery.costingConfirmed ? 'Confirm the costing first' : dirty ? 'Save your changes first' : ''}
                        onClick={openInvoiceDialog}
                      >
                        <FileText size={18} />
                        Create invoice
                      </button>
                    </>
                  )}
                </section>
              )}

              <div className="em-actions">
                <button type="button" className="em-secondary-btn" onClick={() => navigate(`/sales/orders/${delivery.salesOrderId}`)}>
                  Back to order
                </button>
                <button type="button" className="em-secondary-btn" onClick={() => handlePdf(false)}>
                  <FileDown size={18} />
                  Challan PDF
                </button>
                <button type="button" className="em-secondary-btn" onClick={() => handlePdf(true)}>
                  <Printer size={18} />
                  Print challan
                </button>
                {delivery.status === 'Created' && !delivery.invoiceId && (
                  <button type="button" className="em-secondary-btn em-danger-btn" onClick={() => setShowCancel(true)}>
                    <Ban size={18} />
                    Cancel delivery
                  </button>
                )}
                {editable && (
                  <button type="submit" className="em-primary-btn" disabled={saving || !dirty}>
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                )}
              </div>

              {delivery.history?.length > 0 && (
                <section className="em-section">
                  <h3>History</h3>
                  <ul className="so-history">
                    {[...delivery.history].reverse().map((entry, index) => (
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
        isOpen={showInvoice}
        onClose={() => setShowInvoice(false)}
        onConfirm={handleCreateInvoice}
        title="Create invoice"
        message="The invoice takes its numbers, prices and tax from this delivery. Once created it cannot be edited - a wrong invoice has to be cancelled and re-issued."
        type="info"
        confirmText="Create invoice"
        cancelText="Not yet"
      >
        <div className="so-dialog-fields">
          <label>
            Invoice date
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label>
            Payment terms (days)
            <input inputMode="numeric" value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value.replace(/\D/g, ''))} />
          </label>
          <p className="so-dialog-hint">
            Leave the item fields blank to print the material name and the HSN from the Material Master. Fill them in to bill
            something different, for example a service under its SAC code.
          </p>
          {delivery?.lines.map((line) => (
            <div key={line.soLineNo} className="so-dialog-line">
              <strong>{line.materialCode} - {line.materialName}</strong>
              <input
                placeholder="Description on invoice"
                value={invoiceLines[line.soLineNo]?.description || ''}
                onChange={(e) => setInvoiceLines((current) => ({ ...current, [line.soLineNo]: { ...current[line.soLineNo], description: e.target.value } }))}
              />
              <input
                placeholder="HSN/SAC (4 to 8 digits)"
                inputMode="numeric"
                value={invoiceLines[line.soLineNo]?.hsnCode || ''}
                onChange={(e) => setInvoiceLines((current) => ({ ...current, [line.soLineNo]: { ...current[line.soLineNo], hsnCode: e.target.value.replace(/\D/g, '').slice(0, 8) } }))}
              />
            </div>
          ))}
        </div>
      </Popup>

      <Popup
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        title="Cancel delivery"
        message="The quantity goes back to the order so it can be delivered again. This cannot be undone."
        type="danger"
        confirmText="Cancel delivery"
        cancelText="Keep delivery"
      >
        <textarea
          className="so-cancel-reason"
          rows={3}
          placeholder="Reason for cancelling (required)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Popup>
    </div>
  );
};

export default DeliveryDetail;
