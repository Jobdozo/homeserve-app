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
  bootstrap: () => request("/bootstrap"),
  listBookings: (customerId) => request(`/bookings?customerId=${customerId}`),
  createBooking: (data) => request("/bookings", { method: "POST", body: JSON.stringify(data) }),
  createOrder: (data) => request("/orders", { method: "POST", body: JSON.stringify(data) }),
  updateBookingStatus: (id, status) =>
    request(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getMessages: (bookingId) => request(`/messages/${bookingId}`),
  sendMessage: (bookingId, from, text) =>
    request(`/messages/${bookingId}`, { method: "POST", body: JSON.stringify({ from, text }) }),
  submitReview: (bookingId, rating, text) =>
    request(`/bookings/${bookingId}/review`, { method: "POST", body: JSON.stringify({ rating, text }) }),
  getProviderReviews: (providerId) => request(`/providers/${providerId}/reviews`),
  listNotifications: (recipientType, recipientId) =>
    request(`/notifications?recipientType=${recipientType}&recipientId=${recipientId}`),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: (recipientType, recipientId) =>
    request("/notifications/read-all", { method: "POST", body: JSON.stringify({ recipientType, recipientId }) }),
};
