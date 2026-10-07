// Falls back to /api so this screen also works on the local dev server, where VITE_API_URL is not set.
const API_URL = import.meta.env.VITE_API_URL || '/api';

const request = async (url, { method = 'GET', body } = {}) => {
  const token = sessionStorage.getItem('token');
  const response = await fetch(url, {
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

export const payslipApi = (path, options) => request(`${API_URL}/payslips${path}`, options);

// Employees are needed here too, to build the per-employee rows for a month.
export const employeeApiForPayslips = (path, options) => request(`${API_URL}/employees${path}`, options);

export const pdfDownloadUrl = (id) => `${API_URL}/payslips/${id}/pdf`;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
