// Sub-categories: an optional level between a category and its services
// (AC Services -> Window AC / Split AC / VRF AC). Categories without any
// sub-categories behave exactly as before.
//
// Kept in flat JSON like the category banners, so no database schema change:
//   subcategories        { id, categoryId (the category slug), name, sortOrder, active }
//   serviceSubcategories { id (the service id), subcategoryId }
// A service has at most one sub-category, and it must belong to the service's
// own category.
const fs = require("fs");
const path = require("path");
const jsonStore = require("./jsonStore");
const { UPLOADS_DIR } = require("./uploads");

const SUBS = "subcategories";
const LINKS = "serviceSubcategories";

// Files live in the shared uploads folder; only plain /uploads/<name> paths are ever touched.
function deleteUploaded(url) {
  if (!url || !url.startsWith("/uploads/") || !/^[A-Za-z0-9._-]+$/.test(url.slice("/uploads/".length))) return;
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, url.slice("/uploads/".length)));
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Could not remove old sub-category picture", e.message);
  }
}

const fail = (status, message) => Object.assign(new Error(message), { status });

function cleanName(v) {
  const name = String(v || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw fail(400, "Give the sub-category a name");
  return name;
}

function list({ includeInactive = false, categoryId } = {}) {
  return jsonStore
    .readAll(SUBS)
    .filter((s) => (includeInactive || s.active !== false) && (!categoryId || s.categoryId === categoryId))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

function get(id) {
  return jsonStore.readAll(SUBS).find((s) => s.id === id) || null;
}

function create({ categoryId, name }) {
  if (!categoryId) throw fail(400, "Choose a category");
  const clean = cleanName(name);
  const mine = jsonStore.readAll(SUBS).filter((s) => s.categoryId === categoryId);
  if (mine.some((s) => s.name.toLowerCase() === clean.toLowerCase())) throw fail(409, "That category already has a sub-category with this name");
  return jsonStore.insert(SUBS, {
    categoryId,
    name: clean,
    sortOrder: mine.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0) + 1,
    active: true,
    createdAt: new Date().toISOString(),
  });
}

function update(id, patch) {
  const cur = get(id);
  if (!cur) return null;
  const next = {};
  if (patch.name !== undefined) {
    next.name = cleanName(patch.name);
    const clash = jsonStore.readAll(SUBS).some((s) => s.id !== id && s.categoryId === cur.categoryId && s.name.toLowerCase() === next.name.toLowerCase());
    if (clash) throw fail(409, "That category already has a sub-category with this name");
  }
  if (patch.active !== undefined) next.active = Boolean(patch.active);
  if (patch.sortOrder !== undefined) {
    const n = Number(patch.sortOrder);
    if (!Number.isFinite(n)) throw fail(400, "Sort order must be a number");
    next.sortOrder = Math.round(n);
  }
  return jsonStore.update(SUBS, id, next);
}

// Deleting a sub-category leaves its services in the category, unsorted.
function remove(id) {
  const cur = get(id);
  if (!cur) return false;
  deleteUploaded(cur.imageUrl);
  jsonStore.writeAll(LINKS, jsonStore.readAll(LINKS).filter((l) => l.subcategoryId !== id));
  return jsonStore.remove(SUBS, id);
}

// A picture for the type tile on the category page. A new one replaces the old; null removes it.
function setImage(id, url) {
  const cur = get(id);
  if (!cur) return null;
  const old = cur.imageUrl || null;
  const next = jsonStore.update(SUBS, id, { imageUrl: url || null });
  if (old && old !== url) deleteUploaded(old);
  return next;
}

function removeForCategory(categoryId) {
  for (const s of jsonStore.readAll(SUBS).filter((x) => x.categoryId === categoryId)) remove(s.id);
}

function subcategoryOf(serviceId) {
  return jsonStore.readAll(LINKS).find((l) => l.id === serviceId)?.subcategoryId || null;
}

// Puts a service in a sub-category (or takes it out with null). The
// sub-category has to belong to the category the service is in.
function link(serviceId, subcategoryId, categoryId) {
  const existing = jsonStore.readAll(LINKS).find((l) => l.id === serviceId);
  if (!subcategoryId) {
    if (existing) jsonStore.remove(LINKS, serviceId);
    return null;
  }
  const sub = get(subcategoryId);
  if (!sub) throw fail(400, "Unknown sub-category");
  if (sub.categoryId !== categoryId) throw fail(400, "That sub-category belongs to a different category");
  if (existing) jsonStore.update(LINKS, serviceId, { subcategoryId });
  else jsonStore.insert(LINKS, { id: serviceId, subcategoryId });
  return subcategoryId;
}

// A service that moved to another category can't keep a sub-category from the old one.
function reconcile(serviceId, categoryId) {
  const subId = subcategoryOf(serviceId);
  if (subId && get(subId)?.categoryId !== categoryId) jsonStore.remove(LINKS, serviceId);
}

function validate(subcategoryId, categoryId) {
  if (!subcategoryId) return null;
  const sub = get(subcategoryId);
  if (!sub) throw fail(400, "Unknown sub-category");
  if (sub.categoryId !== categoryId) throw fail(400, "That sub-category belongs to a different category");
  return subcategoryId;
}

module.exports = { list, get, create, update, remove, setImage, removeForCategory, subcategoryOf, link, reconcile, validate };
