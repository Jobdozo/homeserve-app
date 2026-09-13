export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
export const API_BASE = `${SERVER_URL}/api`;

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  requestOtp: (phone, role) => request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, role }) }),
  verifyOtp: (phone, code, role) =>
    request("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code, role }) }),
  me: () => request("/auth/me"),

  getOverview: () => request("/admin/overview"),
  listActivities: (limit = 20) => request(`/activities?limit=${limit}`),
  listProviders: () => request("/providers"),
  listCategories: () => request("/categories"),
  listServices: () => request("/services"),
  listBookings: () => request("/bookings"),
  setProviderVerification: (id, status) =>
    request(`/providers/${id}/verification`, { method: "PATCH", body: JSON.stringify({ status }) }),
  setServiceStatus: (id, status) =>
    request(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getTransactions: () => request("/admin/transactions"),
  getReports: () => request("/admin/reports"),
};
