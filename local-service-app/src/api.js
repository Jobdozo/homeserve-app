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

export const api = {
  requestOtp: (phone, role) => request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, role }) }),
  verifyOtp: (phone, code, role, name) =>
    request("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code, role, name }) }),
  me: () => request("/auth/me"),

  bootstrap: (pincode) => request(`/bootstrap${pincode ? `?pincode=${encodeURIComponent(pincode)}` : ""}`),
  listBookings: () => request("/bookings"),
  createBooking: (data) => request("/bookings", { method: "POST", body: JSON.stringify(data) }),
  createOrder: (data) => request("/orders", { method: "POST", body: JSON.stringify(data) }),
  updateBookingStatus: (id, status) =>
    request(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getMessages: (bookingId) => request(`/messages/${bookingId}`),
  sendMessage: (bookingId, text) => request(`/messages/${bookingId}`, { method: "POST", body: JSON.stringify({ text }) }),
  submitReview: (bookingId, rating, text) =>
    request(`/bookings/${bookingId}/review`, { method: "POST", body: JSON.stringify({ rating, text }) }),
  getProviderReviews: (providerId) => request(`/providers/${providerId}/reviews`),
  listNotifications: () => request("/notifications"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),
  reportLocation: (lat, lng, accuracy) =>
    request("/location", { method: "POST", body: JSON.stringify({ lat, lng, accuracy }) }),
  getBookingLiveLocation: (bookingId) => request(`/bookings/${bookingId}/live-location`),
  getBookingOtp: (bookingId) => request(`/bookings/${bookingId}/otp`),
  listBanners: () => request("/banners"),
  getVapidPublicKey: () => request("/push/vapid-public-key"),
  subscribePush: (subscription) => request("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) => request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  validateOffer: (code) => request("/offers/validate", { method: "POST", body: JSON.stringify({ code }) }),
  saveFcmToken: (token) => request("/customer/fcm-token", { method: "POST", body: JSON.stringify({ token }) }),
  getReferralInfo: () => request("/customer/referral"),
  validateReferralCode: (code) =>
    request("/customer/referral/validate", { method: "POST", body: JSON.stringify({ code }) }),
  submitRefundClaim: (bookingId, reason) =>
    request(`/bookings/${bookingId}/refund-claim`, { method: "POST", body: JSON.stringify({ reason }) }),
  registerAdClick: (serviceId) => request(`/services/${serviceId}/ad-click`, { method: "POST" }),
  getMyAddress: () => request("/customer/address"),
  saveMyAddress: (data) => request("/customer/address", { method: "PUT", body: JSON.stringify(data) }),
};
