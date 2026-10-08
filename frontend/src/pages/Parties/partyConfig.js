// Customer and supplier masters are identical apart from these labels and the API they talk to.
export const PARTY_TYPES = {
  customer: { label: 'Customer', plural: 'Customers', api: 'customers', route: '/master-data/customer', hasAddresses: true },
  supplier: { label: 'Supplier', plural: 'Suppliers', api: 'suppliers', route: '/master-data/supplier' }
};

// Falls back to /api so these screens also work on the local dev server, where VITE_API_URL is not set.
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Calls the customer/supplier API with the session token. Errors carry the server message.
export const partyApi = async (type, path = '', { method = 'GET', body } = {}) => {
  const token = sessionStorage.getItem('token');

  const response = await fetch(`${API_URL}/${PARTY_TYPES[type].api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
};
