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
  listCustomers: () => request("/admin/customers"),
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

  createCategory: (data) => request("/admin/categories", { method: "POST", body: JSON.stringify(data) }),
  createProvider: (data) => request("/admin/providers", { method: "POST", body: JSON.stringify(data) }),
  createService: (data) => request("/admin/services", { method: "POST", body: JSON.stringify(data) }),
  broadcastNotification: (data) =>
    request("/admin/notifications/broadcast", { method: "POST", body: JSON.stringify(data) }),

  listBanners: () => request("/admin/banners"),
  createBanner: (data) => request("/admin/banners", { method: "POST", body: JSON.stringify(data) }),
  updateBanner: (id, patch) => request(`/admin/banners/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteBanner: (id) => request(`/admin/banners/${id}`, { method: "DELETE" }),

  listOffers: () => request("/admin/offers"),
  createOffer: (data) => request("/admin/offers", { method: "POST", body: JSON.stringify(data) }),
  updateOffer: (id, patch) => request(`/admin/offers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOffer: (id) => request(`/admin/offers/${id}`, { method: "DELETE" }),
};
