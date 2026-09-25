export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
export const API_BASE = `${SERVER_URL}/api`;

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, options) {
  // Network-level failures (offline, DNS, etc.) throw here with no `status`
  // attached — callers use that to tell "can't reach the server" apart from
  // a real HTTP error response (see AppContext's session restore).
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// Multipart uploads can't go through request() — it always sets a JSON
// Content-Type, which would clobber the multipart boundary the browser
// needs to set itself from the FormData.
async function uploadFile(path, file, extraFields) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(extraFields || {}).forEach(([key, value]) => form.append(key, value));
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Upload failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  requestOtp: (phone, role) => request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, role }) }),
  verifyOtp: (phone, code, role, name) =>
    request("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code, role, name }) }),
  me: () => request("/auth/me"),
  getSwapRules: () => request("/provider/swap-rules"),
  getStaffCatalogue: () => request("/provider/staff/catalogue"),
  listStaff: () => request("/provider/staff"),
  getStaffActivity: () => request("/provider/staff/activity"),
  getStaffMember: (id) => request(`/provider/staff/${id}`),
  createStaff: (data) => request("/provider/staff", { method: "POST", body: JSON.stringify(data) }),
  updateStaff: (id, patch) => request(`/provider/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listAssignableStaff: () => request("/provider/assignable-staff"),
  assignOrder: (bookingId, staffId) => request(`/provider/orders/${bookingId}/assign`, { method: "POST", body: JSON.stringify({ staffId }) }),

  listCategories: () => request("/categories"),
  getProvider: (id) => request(`/providers/${id}`),
  updateProviderProfile: (id, patch) =>
    request(`/providers/${id}/profile`, { method: "PATCH", body: JSON.stringify(patch) }),
  setAcceptingRequests: (id, acceptingRequests) =>
    request(`/providers/${id}/coverage`, { method: "PATCH", body: JSON.stringify({ acceptingRequests }) }),
  updateCoverage: (id, pincodes) =>
    request(`/providers/${id}/coverage`, { method: "PATCH", body: JSON.stringify({ pincodes }) }),
  listBookings: () => request("/bookings"),
  updateBookingStatus: (id, status) =>
    request(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  swapBooking: (id, { reason, note }) =>
    request(`/bookings/${id}/swap`, { method: "POST", body: JSON.stringify({ reason, note }) }),
  getMessages: (bookingId) => request(`/messages/${bookingId}`),
  sendMessage: (bookingId, text) => request(`/messages/${bookingId}`, { method: "POST", body: JSON.stringify({ text }) }),
  listProviderServices: (providerId) => request(`/providers/${providerId}/services`),
  addProviderService: (providerId, data) =>
    request(`/providers/${providerId}/services`, { method: "POST", body: JSON.stringify(data) }),
  updateProviderService: (providerId, serviceId, patch) =>
    request(`/providers/${providerId}/services/${serviceId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getEarnings: (providerId) => request(`/providers/${providerId}/earnings`),
  listNotifications: () => request("/notifications"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),
  reportLocation: (lat, lng, accuracy) =>
    request("/location", { method: "POST", body: JSON.stringify({ lat, lng, accuracy }) }),
  getBookingLiveLocation: (bookingId) => request(`/bookings/${bookingId}/live-location`),
  getVapidPublicKey: () => request("/push/vapid-public-key"),
  subscribePush: (subscription) =>
    request("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) =>
    request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  getProviderNotificationPrefs: () => request("/provider/notification-prefs"),
  updateProviderNotificationPrefs: (patch) =>
    request("/provider/notification-prefs", { method: "PATCH", body: JSON.stringify(patch) }),
  listKycDocuments: () => request("/provider/kyc-documents"),
  uploadKycDocument: (file, docType) => uploadFile("/provider/kyc-documents", file, { docType }),
  deleteKycDocument: (id) => request(`/provider/kyc-documents/${id}`, { method: "DELETE" }),
  listJobPhotos: (bookingId) => request(`/bookings/${bookingId}/photos`),
  uploadJobPhoto: (bookingId, file, photoType) =>
    uploadFile(`/bookings/${bookingId}/photos`, file, { photoType }),
  listJobCheckpoints: (bookingId) => request(`/bookings/${bookingId}/checkpoints`),
  addJobCheckpoint: (bookingId, type) =>
    request(`/bookings/${bookingId}/checkpoints`, { method: "POST", body: JSON.stringify({ type }) }),
  verifyBookingOtp: (bookingId, type, code) =>
    request(`/bookings/${bookingId}/otp/verify`, { method: "POST", body: JSON.stringify({ type, code }) }),
  saveFcmToken: (token) => request("/provider/fcm-token", { method: "POST", body: JSON.stringify({ token }) }),
  acceptAgreement: () => request("/provider/agreement/accept", { method: "POST" }),
  getWallet: () => request("/provider/wallet"),
  listServiceChanges: () => request("/provider/service-changes"),
  getCapacity: () => request("/provider/capacity"),
  listAds: () => request("/provider/ads"),
  createAd: (serviceId) => request("/provider/ads", { method: "POST", body: JSON.stringify({ serviceId }) }),
  setAdStatus: (id, status) => request(`/provider/ads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
