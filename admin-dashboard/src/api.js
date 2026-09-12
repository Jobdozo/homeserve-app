export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
export const API_BASE = `${SERVER_URL}/api`;

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
