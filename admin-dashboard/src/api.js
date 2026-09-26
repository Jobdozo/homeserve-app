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

// CSV goes up as text/csv (not JSON) so a large file isn't subject to the
// JSON body limit; validation errors come back as structured JSON.
async function importCsv(moduleName, csvText, dryRun) {
  const res = await fetch(`${API_BASE}/admin/import/${moduleName}${dryRun ? "?dryRun=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: csvText,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Import failed: ${res.status}`);
  return body;
}

// Evidence goes up as multipart (photo/PDF/document), so no JSON content type.
async function uploadComplaintEvidence(id, file, note) {
  const body = new FormData();
  body.append("file", file);
  if (note) body.append("note", note);
  const res = await fetch(`${API_BASE}/admin/complaints/${id}/evidence`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
  return data;
}

// Service photos go up as multipart, after being shrunk in the browser.
async function uploadServiceImage(id, file) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/admin/services/${id}/image`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
  return data;
}

export const api = {
  importCsv,
  uploadServiceImage,
  removeServiceImage: (id) => request(`/admin/services/${id}/image`, { method: "DELETE" }),
  uploadComplaintEvidence,
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
  listProviderCapacities: () => request("/admin/provider-capacity"),
  getProviderCapacity: (id) => request(`/admin/providers/${id}/capacity`),
  updateProviderCapacity: (id, patch) =>
    request(`/admin/providers/${id}/capacity`, { method: "PATCH", body: JSON.stringify(patch) }),
  warnProvider: (id, message) =>
    request(`/admin/providers/${id}/warn`, { method: "POST", body: JSON.stringify({ message }) }),
  getProviderWallet: (id) => request(`/admin/providers/${id}/wallet`),
  rechargeProviderWallet: (id, amount, note) =>
    request(`/admin/providers/${id}/wallet/recharge`, { method: "POST", body: JSON.stringify({ amount, note }) }),
  listCategories: () => request("/categories"),
  listServices: () => request("/services"),
  listBookings: () => request("/bookings"),
  getBookingMessages: (id) => request(`/messages/${id}`),
  getBookingPhotos: (id) => request(`/bookings/${id}/photos`),
  getBookingCheckpoints: (id) => request(`/bookings/${id}/checkpoints`),
  setProviderVerification: (id, status) =>
    request(`/providers/${id}/verification`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteProvider: (id) => request(`/admin/providers/${id}`, { method: "DELETE" }),
  updateProviderCoverage: (id, patch) =>
    request(`/admin/providers/${id}/coverage`, { method: "PATCH", body: JSON.stringify(patch) }),
  reviewService: (id, decision, note) =>
    request(`/admin/services/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note }) }),
  updateService: (id, patch) =>
    request(`/admin/services/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteService: (id) => request(`/admin/services/${id}`, { method: "DELETE" }),
  setServiceStatus: (id, status) =>
    request(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getTransactions: () => request("/admin/transactions"),
  getReports: () => request("/admin/reports"),

  listAdminChanges: ({ entityType, entityId } = {}) => {
    const q = new URLSearchParams();
    if (entityType) q.set("entityType", entityType);
    if (entityId) q.set("entityId", entityId);
    return request(`/admin/change-log?${q.toString()}`);
  },
  listServiceChanges: (status) => request(`/admin/service-changes${status ? `?status=${status}` : ""}`),
  reviewServiceChange: (id, decision, note, edits) =>
    request(`/admin/service-changes/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note, edits }) }),
  updateCategory: (id, patch) =>
    request(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCategory: (id) => request(`/admin/categories/${id}`, { method: "DELETE" }),
  createCategory: (data) => request("/admin/categories", { method: "POST", body: JSON.stringify(data) }),
  createProvider: (data) => request("/admin/providers", { method: "POST", body: JSON.stringify(data) }),
  createService: (data) => request("/admin/services", { method: "POST", body: JSON.stringify(data) }),
  broadcastNotification: (data) =>
    request("/admin/notifications/broadcast", { method: "POST", body: JSON.stringify(data) }),

  listBanners: () => request("/admin/banners"),
  createBanner: (data) => request("/admin/banners", { method: "POST", body: JSON.stringify(data) }),
  updateBanner: (id, patch) => request(`/admin/banners/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteBanner: (id) => request(`/admin/banners/${id}`, { method: "DELETE" }),

  listComplaints: (params = {}) => request(`/admin/complaints?${new URLSearchParams(params)}`),
  lookupComplaintBookings: (q) => request(`/admin/complaints/lookup?q=${encodeURIComponent(q)}`),
  createComplaint: (data) => request("/admin/complaints", { method: "POST", body: JSON.stringify(data) }),
  getComplaint: (id) => request(`/admin/complaints/${id}`),
  updateComplaint: (id, patch) => request(`/admin/complaints/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  assignComplaint: (id, assigneeId) => request(`/admin/complaints/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeId }) }),
  setComplaintStatus: (id, data) => request(`/admin/complaints/${id}/status`, { method: "POST", body: JSON.stringify(data) }),
  reopenComplaint: (id, reason) => request(`/admin/complaints/${id}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
  addComplaintEntry: (id, data) => request(`/admin/complaints/${id}/entries`, { method: "POST", body: JSON.stringify(data) }),
  listComplaintStages: () => request("/admin/complaint-stages"),
  createComplaintStage: (data) => request("/admin/complaint-stages", { method: "POST", body: JSON.stringify(data) }),
  updateComplaintStage: (key, patch) => request(`/admin/complaint-stages/${key}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteComplaintStage: (key) => request(`/admin/complaint-stages/${key}`, { method: "DELETE" }),
  reorderComplaintStages: (keys) => request("/admin/complaint-stages/reorder", { method: "POST", body: JSON.stringify({ keys }) }),
  listStaff: () => request("/admin/staff"),
  getPermissionCatalogue: () => request("/admin/permissions/catalogue"),
  listUsers: () => request("/admin/users"),
  createUser: (data) => request("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, patch) => request(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteUser: (id) => request(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listRoles: () => request("/admin/roles"),
  createRole: (data) => request("/admin/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id, patch) => request(`/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteRole: (id) => request(`/admin/roles/${id}`, { method: "DELETE" }),
  getProviderVisibility: (id, pincode) => request(`/admin/providers/${id}/visibility${pincode ? `?pincode=${encodeURIComponent(pincode)}` : ""}`),
  setVisibilityOverride: (id, data) => request(`/admin/providers/${id}/visibility-override`, { method: "PUT", body: JSON.stringify(data) }),
  getBusinessRules: () => request("/admin/business-rules"),
  getBookingSwaps: (id) => request(`/admin/bookings/${id}/swaps`),
  getMonitoring: (params) => request(`/admin/monitoring?${new URLSearchParams(params)}`),
  getMonitoringReport: (type, params) => request(`/admin/monitoring/report?${new URLSearchParams({ ...params, type })}`),

  getCommunicationFees: () => request("/admin/communication-fees"),
  setCommunicationFee: (type, id, data) =>
    request(`/admin/communication-fees/${type}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  clearCommunicationFee: (type, id) =>
    request(`/admin/communication-fees/${type}/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listHomeSections: () => request("/admin/home-sections"),
  createHomeSection: (data) => request("/admin/home-sections", { method: "POST", body: JSON.stringify(data) }),
  updateHomeSection: (id, patch) => request(`/admin/home-sections/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteHomeSection: (id) => request(`/admin/home-sections/${id}`, { method: "DELETE" }),
  reorderHomeSections: (ids) => request("/admin/home-sections/reorder", { method: "POST", body: JSON.stringify({ ids }) }),

  removeSeedData: () => request("/admin/remove-seed-data", { method: "POST" }),

  listRefundClaims: () => request("/admin/refund-claims"),
  resolveRefundClaim: (id, status, adminNote) =>
    request(`/admin/refund-claims/${id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote }) }),

  listOffers: () => request("/admin/offers"),
  createOffer: (data) => request("/admin/offers", { method: "POST", body: JSON.stringify(data) }),
  updateOffer: (id, patch) => request(`/admin/offers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOffer: (id) => request(`/admin/offers/${id}`, { method: "DELETE" }),
};
