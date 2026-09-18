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
  getSettings: () => request("/admin/settings"),
  updateSettings: (patch) => request("/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  listActivities: (limit = 20, type) => request(`/activities?limit=${limit}${type ? `&type=${type}` : ""}`),
  listProviders: () => request("/providers"),
  getProvider: (id) => request(`/providers/${id}`),
  getProviderServices: (id) => request(`/providers/${id}/services`),
  getProviderEarnings: (id) => request(`/providers/${id}/earnings`),
  getProviderReviews: (id) => request(`/providers/${id}/reviews`),
  getProviderKycDocuments: (id) => request(`/admin/providers/${id}/kyc-documents`),
  getProviderWallet: (id) => request(`/admin/providers/${id}/wallet`),
  rechargeProviderWallet: (id, amount, note) =>
    request(`/admin/providers/${id}/wallet/recharge`, { method: "POST", body: JSON.stringify({ amount, note }) }),
  listCategories: () => request("/categories"),
  listServices: () => request("/services"),
  listBookings: () => request("/bookings"),
  getBookingPhotos: (id) => request(`/bookings/${id}/photos`),
  getBookingCheckpoints: (id) => request(`/bookings/${id}/checkpoints`),
  setProviderVerification: (id, status) =>
    request(`/providers/${id}/verification`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteProvider: (id) => request(`/admin/providers/${id}`, { method: "DELETE" }),
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

  removeSeedData: () => request("/admin/remove-seed-data", { method: "POST" }),

  listOffers: () => request("/admin/offers"),
  createOffer: (data) => request("/admin/offers", { method: "POST", body: JSON.stringify(data) }),
  updateOffer: (id, patch) => request(`/admin/offers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOffer: (id) => request(`/admin/offers/${id}`, { method: "DELETE" }),
};
