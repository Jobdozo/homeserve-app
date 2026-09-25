// Self-service account deletion (required by Google Play for apps that let
// people create accounts). Bookings, payments and reviews are business records
// other people rely on, so rather than dropping rows the account is
// anonymised: name/phone/email/photo/address details are removed, the login
// number is freed for reuse, push tokens and personal files are deleted, and
// the old sign-in token stops working. Blocked while an order is still open.
const jsonStore = require("./jsonStore");
const store = require("./store");
const push = require("./push");
const fcm = require("./fcm");
const fs = require("fs");
const path = require("path");
const { UPLOADS_DIR } = require("./uploads");
const { query, mutate } = require("./dataconnect");

const DELETED = "deletedAccounts";
const OPEN = ["Pending", "Accepted", "In Progress"];
let revoked = null; // Set of account ids

const fail = (status, message) => Object.assign(new Error(message), { status });

function isDeleted(id) {
  if (!revoked) revoked = new Set(jsonStore.readAll(DELETED).map((r) => r.id));
  return revoked.has(id);
}

function markDeleted(id, role) {
  if (!revoked) isDeleted(id);
  revoked.add(id);
  jsonStore.insert(DELETED, { id, role, at: new Date().toISOString() });
}

function dropDevices(role, id) {
  const k = `${role}:${id}`;
  jsonStore.readAll("pushSubscriptions").filter((s) => s.key === k).forEach((s) => push.removeSubscriptionByEndpoint(s.subscription.endpoint));
  jsonStore.readAll("fcmTokens").filter((t) => t.key === k).forEach((t) => fcm.removeToken(t.token));
}

function removeUploadedFile(url) {
  try {
    const name = path.basename(String(url || ""));
    if (name) fs.rmSync(path.join(UPLOADS_DIR, name), { force: true });
  } catch (e) {
    console.error("upload cleanup failed", e);
  }
}

async function scrubBookingDetails(bookingIds) {
  for (const id of bookingIds) {
    await mutate(
      `mutation($id: UUID!) { booking_update(id: $id, data: { addressLabel: null, addressLine: null, addressLat: null, addressLng: null, issue: "" }) }`,
      { id }
    );
  }
  if (bookingIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { message_deleteMany(where: { bookingId: { in: $ids } }) }`, { ids: bookingIds });
  }
}

async function deleteCustomerAccount(customerId) {
  const customer = await store.getCustomerById(customerId);
  if (!customer || isDeleted(customerId)) throw fail(404, "Account not found");
  const bookings = await store.listBookings({ customerId });
  if (bookings.some((b) => OPEN.includes(b.status))) {
    throw fail(409, "You have an active booking. Please wait for it to finish or cancel it, then delete your account.");
  }
  await mutate(
    `mutation($id: UUID!, $phone: String!) { customer_update(id: $id, data: { name: "Deleted user", avatar: null, phone: $phone, email: null }) }`,
    { id: customerId, phone: `deleted:${customerId}` }
  );
  await scrubBookingDetails(bookings.map((b) => b.id));
  for (const name of ["customerAddresses", "referralCodes", "referralCredits"]) jsonStore.remove(name, customerId);
  jsonStore.readAll("referralRedemptions").filter((r) => r.refereeId === customerId).forEach((r) => jsonStore.remove("referralRedemptions", r.id));
  dropDevices("customer", customerId);
  markDeleted(customerId, "customer");
  store.clearCache("customers");
  store.clearCache("providers");
  await store.logActivity("customer", "A customer deleted their account");
  return true;
}

async function deleteProviderAccount(providerId) {
  const provider = await store.getProvider(providerId);
  if (!provider || isDeleted(providerId)) throw fail(404, "Account not found");
  const bookings = await store.listBookings({ providerId });
  if (bookings.some((b) => OPEN.includes(b.status))) {
    throw fail(409, "You have orders in progress. Please complete or hand them over first, then delete your account.");
  }
  const { services } = await query(`query($id: UUID!) { services(where: { providerId: { eq: $id } }) { id } }`, { id: providerId });
  for (const s of services) {
    await mutate(`mutation($id: UUID!) { service_update(id: $id, data: { status: "inactive" }) }`, { id: s.id });
  }
  await mutate(
    `mutation($id: UUID!, $phone: String!) {
      provider_update(id: $id, data: {
        name: "Deleted provider", avatar: null, phone: $phone, email: null, businessName: null,
        gstNumber: null, serviceArea: null, experience: null, live: false, verified: false, verificationStatus: "rejected"
      })
    }`,
    { id: providerId, phone: `deleted:${providerId}` }
  );
  // KYC documents and their files, staff logins, coverage and preferences.
  jsonStore.readAll("kycDocuments").filter((d) => d.providerId === providerId).forEach((d) => {
    removeUploadedFile(d.url);
    jsonStore.remove("kycDocuments", d.id);
  });
  jsonStore.readAll("providerStaff").filter((s) => s.providerId === providerId).forEach((s) => jsonStore.update("providerStaff", s.id, { active: false, name: "Removed", phone: `deleted:${s.id}`, email: "" }));
  for (const name of ["providerCoverage", "providerNotificationPrefs", "providerVisibilityOverrides"]) jsonStore.remove(name, providerId);
  jsonStore.readAll("providerAds").filter((a) => a.providerId === providerId && a.status !== "stopped").forEach((a) => jsonStore.update("providerAds", a.id, { status: "stopped" }));
  dropDevices("provider", providerId);
  markDeleted(providerId, "provider");
  store.clearCache("providers");
  store.clearCache("service");
  await store.logActivity("provider", `A provider deleted their account (${provider.name})`);
  return true;
}

module.exports = { isDeleted, deleteCustomerAccount, deleteProviderAccount };
