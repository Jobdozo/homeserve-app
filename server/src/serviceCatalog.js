// Service Catalog: a Super Admin-curated library of ready-made services
// ("AC Gas Refill", "Deep Cleaning", …), each tied to a real category. From
// a provider's page in admin, picking one of these creates a real service on
// that provider in one click — name, category, price, tagline and included
// items all pre-filled — instead of typing every field by hand each time.
// Flat-JSON storage, independent of the provider services it creates.
//
// A catalog item's photo is copied to its own physical file each time it's
// applied to a provider (never the same file referenced twice), so deleting
// or replacing one service's photo can never blank out another's.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const store = require("./store");
const { UPLOADS_DIR } = require("./uploads");

const COLLECTION = "serviceCatalog";
const fail = (status, message) => Object.assign(new Error(message), { status });

function deleteUploadedFile(url) {
  if (!url || !url.startsWith("/uploads/") || !/^[A-Za-z0-9._-]+$/.test(url.slice("/uploads/".length))) return;
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, url.slice("/uploads/".length)));
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Could not remove old catalog photo", e.message);
  }
}

// Duplicates the catalog item's photo file under a fresh name, so the new
// service owns an independent copy — deleting it later can't affect the
// template or any other service that started from the same catalog item.
function copyImageForService(url) {
  if (!url || !url.startsWith("/uploads/") || !/^[A-Za-z0-9._-]+$/.test(url.slice("/uploads/".length))) return null;
  const srcName = url.slice("/uploads/".length);
  const ext = path.extname(srcName) || ".jpg";
  const destName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  try {
    fs.copyFileSync(path.join(UPLOADS_DIR, srcName), path.join(UPLOADS_DIR, destName));
    return `/uploads/${destName}`;
  } catch (e) {
    console.error("Could not copy catalog photo for new service", e.message);
    return null;
  }
}

function cleanIncludes(input) {
  return (Array.isArray(input) ? input : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
}

function cleanMoney(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw fail(400, `Enter a valid ${label}`);
  return Math.round(n);
}

function cleanFields(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.categorySlug !== undefined) {
    if (!input.categorySlug) throw fail(400, "Choose a category");
    out.categorySlug = String(input.categorySlug);
  }
  if (!partial || input.name !== undefined) {
    const clean = String(input.name || "").trim().slice(0, 80);
    if (!clean) throw fail(400, "Name is required");
    out.name = clean;
  }
  if (!partial || input.price !== undefined) out.price = cleanMoney(input.price, "price");
  if (input.originalPrice !== undefined) {
    out.originalPrice = input.originalPrice === null || input.originalPrice === "" ? null : cleanMoney(input.originalPrice, "original price");
  }
  if (input.tagline !== undefined) out.tagline = String(input.tagline || "").trim().slice(0, 120);
  if (input.includes !== undefined) out.includes = cleanIncludes(input.includes);
  return out;
}

function diff(before, after, keys) {
  return keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map((field) => ({ field, from: before[field], to: after[field] }));
}

function list() {
  return jsonStore.readAll(COLLECTION).sort((a, b) => a.name.localeCompare(b.name));
}

function create(input, actor) {
  const data = cleanFields(input);
  const row = jsonStore.insert(COLLECTION, {
    ...data,
    originalPrice: data.originalPrice ?? null,
    tagline: data.tagline || "",
    includes: data.includes || [],
    active: input.active !== false,
  });
  store.recordAdminChange({ actor, action: "service_catalog.add", entityType: "service_catalog", entityId: row.id, entityName: row.name });
  return row;
}

function update(id, input, actor) {
  const existing = jsonStore.readAll(COLLECTION).find((r) => r.id === id);
  if (!existing) return undefined;
  const data = cleanFields(input, { partial: true });
  if (input.active !== undefined) data.active = Boolean(input.active);
  const updated = jsonStore.update(COLLECTION, id, data);
  const changes = diff(existing, updated, ["categorySlug", "name", "price", "originalPrice", "tagline", "includes", "active"]);
  if (changes.length) store.recordAdminChange({ actor, action: "service_catalog.update", entityType: "service_catalog", entityId: id, entityName: updated.name, changes });
  return updated;
}

function remove(id, actor) {
  const existing = jsonStore.readAll(COLLECTION).find((r) => r.id === id);
  if (!existing) return false;
  if (existing.imageUrl) deleteUploadedFile(existing.imageUrl);
  jsonStore.remove(COLLECTION, id);
  store.recordAdminChange({ actor, action: "service_catalog.delete", entityType: "service_catalog", entityId: id, entityName: existing.name });
  return true;
}

// Photo on the catalog template itself — upload replaces any previous one.
function setImage(id, url, actor) {
  const existing = jsonStore.readAll(COLLECTION).find((r) => r.id === id);
  if (!existing) return undefined;
  const previous = existing.imageUrl || null;
  const updated = jsonStore.update(COLLECTION, id, { imageUrl: url || null });
  if (previous && previous !== url) deleteUploadedFile(previous);
  store.recordAdminChange({
    actor,
    action: "service_catalog.update",
    entityType: "service_catalog",
    entityId: id,
    entityName: updated.name,
    changes: [{ field: "photo", from: previous ? "uploaded" : "none", to: url ? "uploaded" : "removed" }],
  });
  return updated;
}

// The one-click action: create a real, live service on a provider from a
// catalog template. name/price/originalPrice can be overridden per-provider
// (e.g. a different local price) without touching the template itself.
async function applyToProvider(id, providerId, overrides = {}, actor) {
  const item = jsonStore.readAll(COLLECTION).find((r) => r.id === id);
  if (!item) throw fail(404, "Catalog item not found");
  const provider = await store.getProvider(providerId);
  if (!provider) throw fail(404, "Provider not found");

  const name = overrides.name !== undefined ? String(overrides.name).trim().slice(0, 80) || item.name : item.name;
  const price = overrides.price !== undefined ? cleanMoney(overrides.price, "price") : item.price;
  const originalPrice =
    overrides.originalPrice !== undefined
      ? overrides.originalPrice === null || overrides.originalPrice === "" ? null : cleanMoney(overrides.originalPrice, "original price")
      : item.originalPrice;

  const service = await store.adminCreateService(providerId, { categorySlug: item.categorySlug, name, price, originalPrice }, actor);
  const patch = {};
  if (item.tagline) patch.tagline = item.tagline;
  if (item.includes?.length) patch.includes = item.includes;
  let finalService = Object.keys(patch).length ? await store.adminUpdateService(service.id, patch, actor) : service;

  if (item.imageUrl) {
    const copiedUrl = copyImageForService(item.imageUrl);
    if (copiedUrl) finalService = await store.setServiceImage(service.id, copiedUrl, actor);
  }

  store.recordAdminChange({
    actor,
    action: "service_catalog.apply",
    entityType: "service",
    entityId: finalService.id,
    entityName: `${name} → ${provider.name}`,
    changes: [{ field: "from catalog item", from: null, to: item.name }],
  });
  return finalService;
}

module.exports = { list, create, update, remove, setImage, applyToProvider };
