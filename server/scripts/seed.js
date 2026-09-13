// One-time seed script: inserts server/src/seedData.js into the deployed
// Data Connect Postgres tables. Run locally with GOOGLE_APPLICATION_CREDENTIALS
// pointing at the tikdum-backend service account key:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/seed.js
//
// Safe to re-run against an empty database; not idempotent against a
// partially-seeded one (it will insert duplicates).
const { mutate } = require("../src/dataconnect");
const seed = require("../src/seedData");

async function insertCustomer(customer) {
  const { customer_insert } = await mutate(
    `mutation($name: String!, $phone: String!, $avatar: String, $email: String) {
      customer_insert(data: { name: $name, phone: $phone, avatar: $avatar, email: $email })
    }`,
    { name: customer.name, phone: customer.phone, avatar: customer.avatar, email: customer.email }
  );
  return customer_insert.id;
}

async function insertProvider(p) {
  const { provider_insert } = await mutate(
    `mutation($name: String!, $avatar: String, $category: String, $rating: Float, $reviews: Int, $phone: String!, $live: Boolean, $verified: Boolean, $verificationStatus: String, $businessName: String, $experience: String, $serviceArea: String, $email: String, $gstNumber: String, $responseRate: Int, $joinedAt: Timestamp) {
      provider_insert(data: {
        name: $name, avatar: $avatar, category: $category, rating: $rating, reviews: $reviews,
        phone: $phone, live: $live, verified: $verified, verificationStatus: $verificationStatus,
        businessName: $businessName, experience: $experience, serviceArea: $serviceArea,
        email: $email, gstNumber: $gstNumber, responseRate: $responseRate, joinedAt: $joinedAt
      })
    }`,
    {
      name: p.name,
      avatar: p.avatar,
      category: p.category,
      rating: p.rating,
      reviews: p.reviews,
      phone: p.phone,
      live: !!p.live,
      verified: !!p.verified,
      verificationStatus: p.verificationStatus,
      businessName: p.businessName || null,
      experience: p.experience || null,
      serviceArea: p.serviceArea || null,
      email: p.email || null,
      gstNumber: p.gstNumber || null,
      responseRate: p.responseRate || null,
      joinedAt: p.joinedAt,
    }
  );
  return provider_insert.id;
}

async function insertCategory(c) {
  const { category_insert } = await mutate(
    `mutation($slug: String!, $name: String!, $icon: String) {
      category_insert(data: { slug: $slug, name: $name, icon: $icon })
    }`,
    { slug: c.id, name: c.name, icon: c.icon }
  );
  return category_insert.id;
}

async function insertService(s, categoryId, providerId) {
  const { service_insert } = await mutate(
    `mutation($categoryId: UUID!, $providerId: UUID!, $name: String!, $icon: String, $tagline: String, $price: Int!, $originalPrice: Int, $rating: Float, $reviewCount: Int, $distanceLabel: String, $status: String!) {
      service_insert(data: {
        categoryId: $categoryId, providerId: $providerId, name: $name, icon: $icon, tagline: $tagline,
        price: $price, originalPrice: $originalPrice, rating: $rating, reviewCount: $reviewCount,
        distanceLabel: $distanceLabel, status: $status
      })
    }`,
    {
      categoryId,
      providerId,
      name: s.name,
      icon: s.icon,
      tagline: s.tagline || null,
      price: s.price,
      originalPrice: s.originalPrice || null,
      rating: s.rating || 0,
      reviewCount: s.reviewCount || 0,
      distanceLabel: s.distanceLabel || null,
      status: s.status,
    }
  );
  const serviceId = service_insert.id;

  for (const h of s.highlights || []) {
    await mutate(
      `mutation($serviceId: UUID!, $icon: String, $label: String!) {
        serviceHighlight_insert(data: { serviceId: $serviceId, icon: $icon, label: $label })
      }`,
      { serviceId, icon: h.icon, label: h.label }
    );
  }
  for (const text of s.includes || []) {
    await mutate(
      `mutation($serviceId: UUID!, $text: String!) {
        serviceInclude_insert(data: { serviceId: $serviceId, text: $text })
      }`,
      { serviceId, text }
    );
  }
  return serviceId;
}

async function insertBooking(b, serviceId, providerId, customerId) {
  const { booking_insert } = await mutate(
    `mutation($orderId: String, $serviceId: UUID!, $providerId: UUID!, $customerId: UUID!, $status: String!, $date: Date!, $time: String!, $addressLabel: String, $addressLine: String, $issue: String, $amount: Int!, $createdAt: Timestamp!, $cancelledAt: Timestamp, $reviewed: Boolean, $reviewRating: Int, $reviewText: String) {
      booking_insert(data: {
        orderId: $orderId, serviceId: $serviceId, providerId: $providerId, customerId: $customerId,
        status: $status, date: $date, time: $time, addressLabel: $addressLabel, addressLine: $addressLine,
        issue: $issue, amount: $amount, createdAt: $createdAt, cancelledAt: $cancelledAt,
        reviewed: $reviewed, reviewRating: $reviewRating, reviewText: $reviewText
      })
    }`,
    {
      orderId: b.orderId || null,
      serviceId,
      providerId,
      customerId,
      status: b.status,
      date: b.date,
      time: b.time,
      addressLabel: b.address?.label || null,
      addressLine: b.address?.line || null,
      issue: b.issue || null,
      amount: b.amount,
      createdAt: b.createdAt,
      cancelledAt: b.cancelledAt || null,
      reviewed: !!b.reviewed,
      reviewRating: b.review?.rating ?? null,
      reviewText: b.review?.text ?? null,
    }
  );
  const bookingId = booking_insert.id;

  for (const [status, at] of Object.entries(b.statusHistory || {})) {
    await mutate(
      `mutation($bookingId: UUID!, $status: String!, $at: Timestamp!) {
        bookingStatusEvent_insert(data: { bookingId: $bookingId, status: $status, at: $at })
      }`,
      { bookingId, status, at }
    );
  }
  return bookingId;
}

async function insertMessage(bookingId, m) {
  await mutate(
    `mutation($bookingId: UUID!, $sender: String!, $text: String!, $sentAt: Timestamp!) {
      message_insert(data: { bookingId: $bookingId, sender: $sender, text: $text, sentAt: $sentAt })
    }`,
    { bookingId, sender: m.from, text: m.text, sentAt: m.time }
  );
}

async function insertActivity(a) {
  await mutate(
    `mutation($type: String!, $message: String!, $occurredAt: Timestamp!) {
      activity_insert(data: { type: $type, message: $message, occurredAt: $occurredAt })
    }`,
    { type: a.type, message: a.message, occurredAt: a.time }
  );
}

async function main() {
  console.log("Seeding customer...");
  const customerId = await insertCustomer(seed.customer);
  const customerIdMap = { [seed.customer.id]: customerId };

  console.log("Seeding providers...");
  const providerIdMap = {};
  for (const [oldId, p] of Object.entries(seed.providers)) {
    providerIdMap[oldId] = await insertProvider(p);
  }

  console.log("Seeding categories...");
  const categoryIdMap = {};
  for (const c of seed.categories) {
    categoryIdMap[c.id] = await insertCategory(c);
  }

  console.log("Seeding services...");
  const serviceIdMap = {};
  for (const s of seed.services) {
    serviceIdMap[s.id] = await insertService(s, categoryIdMap[s.categoryId], providerIdMap[s.providerId]);
  }

  console.log("Seeding bookings + messages...");
  for (const b of seed.bookings) {
    const bookingId = await insertBooking(
      b,
      serviceIdMap[b.serviceId],
      providerIdMap[b.providerId],
      customerIdMap[b.customerId]
    );
    for (const m of seed.messages[b.id] || []) {
      await insertMessage(bookingId, m);
    }
  }

  console.log("Seeding activities...");
  for (const a of seed.activities) {
    await insertActivity(a);
  }

  console.log("\nDone. ID mappings (old slug -> new UUID):");
  console.log("customers:", customerIdMap);
  console.log("providers:", providerIdMap);
  console.log("categories:", categoryIdMap);
  console.log("services:", serviceIdMap);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
