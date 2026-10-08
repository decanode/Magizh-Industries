import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Printer, FileDown } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import Popup from '../../components/popup';
import { invoiceApi, openPdf, formatMoney, formatAddress, formatDate, invoiceState } from './salesApi';
import '../../styles/pageStyles/Employees/EmployeeList.css';
import '../../styles/pageStyles/Employees/EmployeeForm.css';
import '../../styles/pageStyles/Sales/SalesOrder.css';

// A tax invoice as issued. It never changes; the only action is to cancel it so a corrected one can be raised.
const InvoiceDetail = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [copy, setCopy] = useState('original');

  useEffect(() => {
    let cancelled = false;

    invoiceApi(`/${id}`)
      .then(({ item }) => !cancelled && setInvoice(item))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    try {
      await invoiceApi(`/${id}/cancel`, { method: 'POST', body: { reason: cancelReason } });
      const { item } = await invoiceApi(`/${id}`);
      setInvoice(item);
      setShowCancel(false);
      setCancelReason('');
    } catch (err) {
      setShowCancel(false);
      setError(err.message);
    }
  };

  const handlePdf = async (print) => {
    setError('');
    try {
      await openPdf(`/invoices/${id}/pdf?copy=${copy}`, { print });
    } catch (err) {
      setError(err.message);
    }
  };

  const state = invoice && invoiceState(invoice);

  return (
    <div className="em-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title={invoice ? invoice.invoiceNumber : 'Invoice'} onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="em-content page-with-navbar">
        <div className="em-wrapper">
          {error && <div className="em-error">{error}</div>}

          {invoice?.status === 'Cancelled' && (
            <div className="em-exit-banner">This invoice is cancelled. Reason: {invoice.cancelReason}. Its number stays on record and is not reused.</div>
          )}

          {loading ? (
            <p className="em-muted">Loading...</p>
          ) : !invoice ? null : (
            <div className="em-form so-form">
              <section className="em-section">
                <h3>
                  {invoice.invoiceNumber} <span className={`em-status ${state.tone}`}>{state.label}</span>
                </h3>
                <div className="so-facts">
                  <div><span>Invoice date</span>{formatDate(invoice.invoiceDate)}</div>
                  <div><span>Due date</span>{formatDate(invoice.dueDate)} ({invoice.paymentTermsDays} days)</div>
                  <div>
                    <span>Delivery</span>
                    <button type="button" className="so-link" onClick={() => navigate(`/sales/deliveries/${invoice.deliveryId}`)}>{invoice.dcNumber}</button>
                  </div>
                  <div>
                    <span>Sales order</span>
                    <button type="button" className="so-link" onClick={() => navigate(`/sales/orders/${invoice.salesOrderId}`)}>{invoice.soNumber}</button>
                  </div>
                  <div><span>Customer PO</span>{invoice.customerPoNumber || '-'}</div>
                  <div><span>HALB</span>{invoice.quotationNumber || '-'}</div>
                  <div><span>E-way bill</span>{invoice.ewayBillNumber || '-'}</div>
                  <div><span>Vehicle</span>{invoice.vehicleNumber || '-'}</div>
                  <div><span>Costing confirmed</span>{invoice.costingReference || 'Yes'}</div>
                </div>
              </section>

              <section className="em-section">
                <h3>Parties</h3>
                <div className="so-facts so-facts-wide">
                  <div><span>Customer</span>{invoice.customer.code} - {invoice.customer.name}{invoice.customer.gstin ? ` (GSTIN ${invoice.customer.gstin})` : ''}</div>
                  <div><span>Bill-to</span>{formatAddress(invoice.billTo)}</div>
                  <div><span>Ship-to</span>{formatAddress(invoice.shipTo)}</div>
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
                        <th>HSN</th>
                        <th>Quantity</th>
                        <th>Price (₹)</th>
                        <th>GST %</th>
                        <th className="so-right">Taxable (₹)</th>
                        <th className="so-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((line) => (
                        <tr key={line.lineNo}>
                          <td>{line.lineNo}</td>
                          <td className="so-col-material">{line.materialCode} - {line.materialName}</td>
                          <td>{line.hsnCode}</td>
                          <td>{line.quantity} {line.unit}</td>
                          <td>{formatMoney(line.unitPrice)}</td>
                          <td>{line.gstRate}</td>
                          <td className="so-right">{formatMoney(line.taxableAmount)}</td>
                          <td className="so-right">{formatMoney(line.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <table className="so-totals so-totals-right">
                  <tbody>
                    <tr><td>Subtotal</td><td>{formatMoney(invoice.totals.subtotal)}</td></tr>
                    {invoice.taxType === 'INTER' ? (
                      <tr><td>IGST</td><td>{formatMoney(invoice.totals.igst)}</td></tr>
                    ) : (
                      <>
                        <tr><td>CGST</td><td>{formatMoney(invoice.totals.cgst)}</td></tr>
                        <tr><td>SGST</td><td>{formatMoney(invoice.totals.sgst)}</td></tr>
                      </>
                    )}
                    <tr className="so-grand"><td>Total (₹)</td><td>{formatMoney(invoice.totals.grandTotal)}</td></tr>
                  </tbody>
                </table>
              </section>

              <div className="em-actions">
                <button type="button" className="em-secondary-btn" onClick={() => navigate('/sales/invoices')}>
                  Back to invoices
                </button>
                <select className="so-copy-select" value={copy} onChange={(e) => setCopy(e.target.value)} aria-label="Copy label">
                  <option value="original">Original for Recipient</option>
                  <option value="duplicate">Duplicate for Transporter</option>
                  <option value="triplicate">Triplicate for Supplier</option>
                </select>
                <button type="button" className="em-secondary-btn" onClick={() => handlePdf(false)}>
                  <FileDown size={18} />
                  Invoice PDF
                </button>
                <button type="button" className="em-secondary-btn" onClick={() => handlePdf(true)}>
                  <Printer size={18} />
                  Print invoice
                </button>
                {invoice.status === 'Issued' && (
                  <button type="button" className="em-secondary-btn em-danger-btn" onClick={() => setShowCancel(true)}>
                    <Ban size={18} />
                    Cancel invoice
                  </button>
                )}
              </div>

              <section className="em-section">
                <h3>History</h3>
                <ul className="so-history">
                  {[...invoice.history].reverse().map((entry, index) => (
                    <li key={index}>
                      {new Date(entry.at).toLocaleString('en-IN')} - {entry.action} by {entry.by}
                      {entry.note ? ` (${entry.note})` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>

      <Popup
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        title="Cancel invoice"
        message="The invoice stays on record as cancelled and its number is not reused. The delivery is released so a corrected invoice can be created."
        type="danger"
        confirmText="Cancel invoice"
        cancelText="Keep invoice"
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

export default InvoiceDetail;
