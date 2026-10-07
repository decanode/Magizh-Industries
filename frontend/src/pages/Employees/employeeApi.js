// Falls back to /api so these screens also work on the local dev server, where VITE_API_URL is not set.
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Calls the employee API with the session token. Errors carry the server message and any validation errors.
export const employeeApi = async (path, { method = 'GET', body } = {}) => {
  const token = sessionStorage.getItem('token');

  const response = await fetch(`${API_URL}/employees${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.errors = data.errors || [];
    throw error;
  }

  return data;
};
