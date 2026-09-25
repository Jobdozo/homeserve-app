import { api } from "../api";

// The provider's number isn't part of the public catalog — it's fetched from
// the customer's own booking, and only while the order is active. Once the
// order is Completed the server refuses, so calling is no longer possible.
export async function callProvider(bookingId, showToast) {
  try {
    const { phone } = await api.getProviderContact(bookingId);
    window.location.href = `tel:${phone}`;
  } catch (e) {
    showToast(e.message || "Couldn't get the provider's number");
  }
}
