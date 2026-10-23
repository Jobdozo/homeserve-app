// Image Studio branding (imageStudio.js):
//   - one colour per service category (Admin can change it; no two categories share one).
//     Pictures are realistic, so the colour shows in small details the AI is asked to use
//     (towels, cloths, uniform trim, a backdrop) and as the band around the stamped logo;
//     a type (sub-category) uses a lighter shade of its category's colour;
//   - the logo file stamped on every picture (an uploaded one, else the built-in badge);
//   - the picture an approved one replaced, kept so it can be restored.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const { UPLOADS_DIR, nameOf, removeFile } = require("./uploads");

const COLOURS = "imageStudioColours"; // { id: categorySlug, hex, name, updatedAt, updatedBy }
const LOGO = "imageStudioLogo"; // { id: "logo", url, updatedAt, updatedBy }
const HISTORY = "imageStudioHistory"; // { id, targetType, targetId, name, url, keptAt, keptBy, restoredAt? }
const BUILT_IN_LOGO = path.join(__dirname, "assets", "tikdum-badge.png");
const KEEP_PER_TARGET = 3;
const fail = (status, message) => Object.assign(new Error(message), { status });

// Starting colours for Tikdum's categories; anything else gets an unused one from SPARE.
const DEFAULTS = {
  "home-cleaning": ["#2F80ED", "fresh blue"],
  "ac-repair": ["#6EC1E4", "ice blue"],
  electrician: ["#F2C230", "yellow"],
  "water-tank-cleaning": ["#1F4E99", "deep blue"],
  "gas-stove-chimney-repair-services": ["#F2994A", "warm orange"],
  "interior-services": ["#159A9C", "teal"],
  "salon-spa": ["#E5679A", "rose pink"],
  "pest-control": ["#27AE60", "green"],
  "appliance-repair": ["#8E44AD", "purple"],
  "ro-water-purifier-services": ["#22C3D6", "aqua"],
  "computer-repair": ["#4B4FC9", "indigo"],
  "masonry-services": ["#B5523B", "brick red"],
};
const SPARE = [["#0E7C66", "emerald"], ["#C0392B", "crimson"], ["#5D6D7E", "slate"], ["#D35400", "burnt orange"], ["#6C3483", "plum"], ["#117A65", "pine green"]];
const HEX = /^#[0-9a-f]{6}$/i;

const saved = () => new Map(jsonStore.readAll(COLOURS).map((r) => [r.id, r]));

// slugs: every category slug, in a stable order, so spare colours are handed out the same way each time.
function assign(slugs) {
  const rows = saved();
  const out = new Map();
  for (const slug of slugs) {
    const r = rows.get(slug);
    if (r) out.set(slug, { hex: r.hex, name: r.name, custom: true });
    else if (DEFAULTS[slug]) out.set(slug, { hex: DEFAULTS[slug][0], name: DEFAULTS[slug][1], custom: false });
  }
  const used = new Set([...out.values()].map((c) => c.hex.toLowerCase()));
  const spare = SPARE.filter(([hex]) => !used.has(hex.toLowerCase()));
  for (const slug of slugs) {
    if (out.has(slug)) continue;
    const [hex, name] = spare.shift() || ["#5B3FD0", "Tikdum purple"];
    out.set(slug, { hex, name, custom: false });
  }
  return out;
}

// [{ slug, category, hex, name, custom }] for Admin.
function list(categories) {
  const map = assign(categories.map((c) => c.id));
  return categories.map((c) => ({ slug: c.id, category: c.name, ...map.get(c.id) }));
}

// Lighter shade (towards white) for a type inside the category.
function lighter(hex, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return `#${[mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// { hex, name } for a picture of something in this category (shade: a type).
function colourFor(slug, allSlugs, { shade = false } = {}) {
  const c = assign([...new Set([...(allSlugs || []), slug])]).get(slug) || { hex: "#5B3FD0", name: "Tikdum purple" };
  return shade ? { hex: lighter(c.hex), name: `light ${c.name}` } : { hex: c.hex, name: c.name };
}

function setColour(slug, input, allSlugs, actor) {
  const hex = String(input?.hex || "").trim();
  const name = String(input?.name || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!HEX.test(hex)) throw fail(400, "Choose a colour");
  if (!name) throw fail(400, "Give the colour a name (it's how the AI is told about it)");
  const others = assign(allSlugs);
  const clash = [...others].find(([s, c]) => s !== slug && c.hex.toLowerCase() === hex.toLowerCase());
  if (clash) throw fail(409, "Another category already uses this colour — each category needs its own");
  const row = { id: slug, hex: hex.toUpperCase(), name, updatedAt: new Date().toISOString(), updatedBy: actor || null };
  if (saved().has(slug)) jsonStore.update(COLOURS, slug, row);
  else jsonStore.insert(COLOURS, row);
  return row;
}

// ---- logo ----
const logoRow = () => jsonStore.readAll(LOGO)[0] || null;
const uploadPath = (url) => (nameOf(url) ? path.join(UPLOADS_DIR, nameOf(url)) : null);

// The file to stamp: the uploaded logo if it's still there, else the built-in badge.
function logoFile() {
  const p = uploadPath(logoRow()?.url);
  return p && fs.existsSync(p) ? p : BUILT_IN_LOGO;
}

function logoInfo() {
  const row = logoRow();
  return { custom: Boolean(row && logoFile() !== BUILT_IN_LOGO), url: row?.url || null, updatedAt: row?.updatedAt || null };
}

function setLogo(url, actor) {
  const old = logoRow();
  const row = { id: "logo", url, updatedAt: new Date().toISOString(), updatedBy: actor || null };
  if (old) jsonStore.update(LOGO, "logo", row);
  else jsonStore.insert(LOGO, row);
  if (old?.url && old.url !== url) removeFile(old.url);
  return logoInfo();
}

function clearLogo() {
  const old = logoRow();
  if (old) {
    jsonStore.remove(LOGO, "logo");
    if (old.url) removeFile(old.url);
  }
  return logoInfo();
}

// ---- pictures replaced by an approved one ----
function copyUpload(url, prefix) {
  const from = uploadPath(url);
  if (!from || !fs.existsSync(from)) return null;
  const name = `${prefix}${crypto.randomBytes(12).toString("hex")}${path.extname(from) || ".jpg"}`;
  fs.copyFileSync(from, path.join(UPLOADS_DIR, name));
  return `/uploads/${name}`;
}

// Copies the current picture before it's replaced. null when there's nothing (or no local file) to keep.
function keep({ targetType, targetId, name, currentUrl }, actor) {
  const url = currentUrl ? copyUpload(currentUrl, "kept-") : null;
  if (!url) return null;
  const row = jsonStore.insert(HISTORY, { targetType, targetId: String(targetId), name: String(name || "").slice(0, 120), url, keptAt: new Date().toISOString(), keptBy: actor || null });
  const mine = jsonStore
    .readAll(HISTORY)
    .filter((r) => r.targetType === targetType && r.targetId === String(targetId))
    .sort((a, b) => String(b.keptAt).localeCompare(String(a.keptAt)));
  for (const old of mine.slice(KEEP_PER_TARGET)) {
    removeFile(old.url);
    jsonStore.remove(HISTORY, old.id);
  }
  return row;
}

function listKept(limit = 40) {
  return jsonStore.readAll(HISTORY).sort((a, b) => String(b.keptAt).localeCompare(String(a.keptAt))).slice(0, limit);
}

// A fresh copy of a kept picture to put back (the setter then removes whatever replaced it).
function restoreCopy(id) {
  const row = jsonStore.readAll(HISTORY).find((r) => r.id === id);
  if (!row) throw fail(404, "That picture is no longer kept");
  const url = copyUpload(row.url, "");
  if (!url) throw fail(410, "The kept picture's file is gone");
  return { row, url };
}

function markRestored(id, actor) {
  return jsonStore.update(HISTORY, id, { restoredAt: new Date().toISOString(), restoredBy: actor || null });
}

module.exports = { list, colourFor, setColour, lighter, logoFile, logoInfo, setLogo, clearLogo, keep, listKept, restoreCopy, markRestored, DEFAULTS, BUILT_IN_LOGO };
