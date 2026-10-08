// Falls back to /api so these screens also work on the local dev server, where VITE_API_URL is not set.
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Calls the sales order API with the session token. Errors carry the server message, its code and any details
// (for example the list of short materials when stock is not enough).
export const salesApi = async (path = '', { method = 'GET', body, headers = {} } = {}) => {
  const token = sessionStorage.getItem('token');

  const response = await fetch(`${API_URL}/sales-orders${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.code = data.code;
    error.details = data.details;
    throw error;
  }

  return data;
};

// Customers come from the customer master API
export const fetchCustomers = async (search = '') => {
  const token = sessionStorage.getItem('token');
  const response = await fetch(`${API_URL}/customers?search=${encodeURIComponent(search)}&pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Failed to load customers');
  return data.items;
};

export const fetchCustomer = async (id) => {
  const token = sessionStorage.getItem('token');
  const response = await fetch(`${API_URL}/customers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Failed to load customer');
  return data.item;
};

export const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatAddress = (address) =>
  [address.label && `${address.label}:`, address.line1, address.line2, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');

// Deliveries are listed and changed through their own API; creating one goes through the order
export const deliveryApi = async (path = '', { method = 'GET', body } = {}) => {
  const token = sessionStorage.getItem('token');

  const response = await fetch(`${API_URL}/deliveries${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.code = data.code;
    error.details = data.details;
    throw error;
  }

  return data;
};

// 2026-10-08 -> 08-10-2026
export const formatDate = (isoDate) => {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
};

// A delivery's state for display: cancelled, costing confirmed by the customer, or still waiting for that
export const deliveryState = (delivery) => {
  if (delivery.status === 'Cancelled') return { label: 'Cancelled', tone: 'inactive' };
  if (delivery.invoiceId) return { label: 'Invoiced', tone: 'active' };
  if (delivery.costingConfirmed) return { label: 'Costing confirmed', tone: 'active' };
  return { label: 'Costing pending', tone: 'pending' };
};

// Invoices are created from a delivery and then only viewed or cancelled
export const invoiceApi = async (path = '', { method = 'GET', body, headers = {} } = {}) => {
  const token = sessionStorage.getItem('token');

  const response = await fetch(`${API_URL}/invoices${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.code = data.code;
    error.details = data.details;
    throw error;
  }

  return data;
};

// An invoice's state for display. Overdue is an unpaid invoice past its due date.
export const invoiceState = (invoice) => {
  if (invoice.status === 'Cancelled') return { label: 'Cancelled', tone: 'inactive' };
  if (invoice.status === 'Paid') return { label: 'Paid', tone: 'active' };
  if (invoice.overdue) return { label: `Overdue ${invoice.daysOverdue}d`, tone: 'overdue' };
  return { label: 'Issued', tone: 'pending' };
};

// Fetches a PDF with the session token and either opens it in a new tab (where the browser's viewer can print or
// save it) or sends it straight to the print dialog. A plain link can't be used because the token travels in a header.
export const openPdf = async (path, { print = false } = {}) => {
  const token = sessionStorage.getItem('token');
  // Opened before the request so the browser treats it as a direct click and doesn't block the pop-up
  const tab = print ? null : window.open('', '_blank');

  try {
    const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || `Could not create the PDF (${response.status})`);
    }
    const url = URL.createObjectURL(await response.blob());

    if (print) {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      frame.onload = () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      };
      frame.src = url;
      document.body.appendChild(frame);
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 120000);
    } else {
      tab.location.href = url;
    }
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
};
