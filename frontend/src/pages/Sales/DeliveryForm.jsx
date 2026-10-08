import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { salesApi, fetchCustomer, formatMoney, formatAddress } from './salesApi';
import { previewTotals } from './pricing';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

const todayLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const remainingOf = (line) => Math.round((line.quantity - (line.deliveredQty || 0)) * 1000) / 1000;

// Create a delivery against an order: choose how much of each line ships now, and where to.
const DeliveryForm = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { orderId } = useParams();

  // One key per form: a double click or retry creates only one delivery
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({ shipToId: '', deliveryDate: todayLocal(), vehicleNumber: '', transporter: '', ewayBillNumber: '', notes: '' });
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { item } = await salesApi(`/${orderId}`);
        const loadedCustomer = await fetchCustomer(item.customerId);
        if (cancelled) return;

        setOrder(item);
        setCustomer(loadedCustomer);
        setForm((current) => ({ ...current, shipToId: item.shipTo.id }));
        // Everything still undelivered is pre-filled, since most deliveries ship the lot
        setLines(
          item.lines
            .filter((line) => remainingOf(line) > 0)
            .map((line) => ({ lineNo: line.lineNo, quantity: String(remainingOf(line)), unitPrice: String(line.unitPrice) }))
        );
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
  }, [orderId]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateLine = (lineNo, changes) => setLines((current) => current.map((line) => (line.lineNo === lineNo ? { ...line, ...changes } : line)));

  const orderLine = (lineNo) => order.lines.find((line) => line.lineNo === lineNo);
  const shippingAddresses = (customer?.addresses || []).filter((address) => address.type === 'shipping');

  const totals = useMemo(() => {
    if (!order) return null;
    return previewTotals(
      lines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => ({ material: { igst: orderLine(line.lineNo).gstRate }, quantity: line.quantity, unitPrice: line.unitPrice })),
      order.taxType
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, order]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setProblems([]);

    const shipping = lines.filter((line) => Number(line.quantity) > 0);
    if (shipping.length === 0) {
      setError('Enter a quantity for at least one item');
      return;
    }
    const tooMuch = shipping.find((line) => Number(line.quantity) > remainingOf(orderLine(line.lineNo)) + 1e-9);
    if (tooMuch) {
      setError(`${orderLine(tooMuch.lineNo).materialName}: only ${remainingOf(orderLine(tooMuch.lineNo))} left to deliver`);
      return;
    }
    if (shipping.some((line) => line.unitPrice === '')) {
      setError('Enter a price for every item being delivered');
      return;
    }

    setSaving(true);
    try {
      const { item } = await salesApi(`/${orderId}/deliveries`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: {
          ...form,
          lines: shipping.map((line) => ({ lineNo: line.lineNo, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }))
        }
      });
      navigate(`/sales/deliveries/${item.id}`);
    } catch (err) {
      setError(err.message);
      if (err.code === 'OVER_DELIVERY') setProblems(err.details || []);
      setSaving(false);
    }
  };

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="New Delivery" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          {error && (
            <div className="em-error">
              {error}
              {problems.length > 0 && (
                <ul className="so-shortages">
                  {problems.map((item) => (
                    <li key={item.lineNo}>{item.materialName}: requested {item.requested}, only {item.remaining} left</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {customer?.archived && (
            <div className="em-exit-banner so-info-banner">
              This customer has been archived. You can still view this record, but creating deliveries is blocked until the customer is restored.
            </div>
          )}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : !order ? null : lines.length === 0 ? (
            <>
              <p className="em-muted">Nothing is left to deliver on {order.soNumber}.</p>
              <button type="button" className="em-secondary-btn" onClick={() => navigate(`/sales/orders/${orderId}`)}>Back to order</button>
            </>
          ) : (
            <form className="em-form so-form" onSubmit={handleSubmit}>
              <fieldset disabled={saving} className="so-fieldset">
                <section className="em-section">
                  <h3>Delivery for {order.soNumber}</h3>
                  <p className="em-muted">
                    Customer: {order.customer.code} - {order.customer.name}. Bill-to: {formatAddress(order.billTo)}
                  </p>
                  <div className="em-grid so-address-grid">
                    <label>
                      Ship-to address *
                      <select value={form.shipToId} onChange={(e) => updateField('shipToId', e.target.value)}>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>{formatAddress(address)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Delivery date *
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
                  <div className="em-table-wrap">
                    <table className="em-table so-lines">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th className="so-col-material">Material</th>
                          <th>Ordered</th>
                          <th>Delivered</th>
                          <th>Left</th>
                          <th>Deliver now</th>
                          <th>Price (₹)</th>
                          <th className="so-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => {
                          const source = orderLine(line.lineNo);
                          const tooMuch = Number(line.quantity) > remainingOf(source) + 1e-9;
                          return (
                            <tr key={line.lineNo} className={tooMuch ? 'so-line-problem' : ''}>
                              <td>{source.lineNo}</td>
                              <td className="so-col-material">{source.materialCode} - {source.materialName}</td>
                              <td>{source.quantity} {source.unit}</td>
                              <td>{source.deliveredQty || 0}</td>
                              <td>{remainingOf(source)}</td>
                              <td>
                                <input
                                  className="so-number"
                                  inputMode="decimal"
                                  value={line.quantity}
                                  onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && updateLine(line.lineNo, { quantity: e.target.value })}
                                />
                                {tooMuch && <div className="so-line-error">Only {remainingOf(source)} left</div>}
                              </td>
                              <td>
                                <input
                                  className="so-number"
                                  inputMode="decimal"
                                  value={line.unitPrice}
                                  onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && updateLine(line.lineNo, { unitPrice: e.target.value })}
                                />
                              </td>
                              <td className="so-right">{formatMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}</td>
                            </tr>
                          );
                        })}
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
                      {order.taxType === 'INTER' ? (
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
                <button type="button" className="em-secondary-btn" onClick={() => navigate(`/sales/orders/${orderId}`)}>
                  Cancel
                </button>
                <button type="submit" className="em-primary-btn" disabled={saving || customer?.archived}>
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Create delivery'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeliveryForm;
