// Locations: the serviceable Cities / Areas / PIN codes list, each
// independently switchable on/off. This is the "Locations" module in the
// admin sidebar (previously a placeholder). Flat-JSON storage, three
// collections in a simple hierarchy: City -> Area -> PIN code.
//
// A location only counts as serviceable when it AND every level above it is
// active (isPincodeServiceable) — switching a city off takes its areas and
// pincodes with it without having to touch each one.
const jsonStore = require("./jsonStore");
const store = require("./store");

const CITIES = "locationCities";
const AREAS = "locationAreas";
const PINCODES = "locationPincodes";

const fail = (status, message) => Object.assign(new Error(message), { status });

function cleanName(name, label, max = 60) {
  const clean = String(name || "").trim().slice(0, max);
  if (!clean) throw fail(400, `${label} name is required`);
  return clean;
}

function cleanPincode(pincode) {
  const clean = String(pincode || "").trim();
  if (!/^[1-9][0-9]{5}$/.test(clean)) throw fail(400, "Enter a valid 6-digit PIN code");
  return clean;
}

function diff(before, after, keys) {
  return keys.filter((k) => before[k] !== after[k]).map((field) => ({ field, from: before[field], to: after[field] }));
}

// ---- read (the whole tree — small dataset, the admin screen renders it all at once) ----

function tree() {
  const cities = jsonStore.readAll(CITIES);
  const areas = jsonStore.readAll(AREAS);
  const pincodes = jsonStore.readAll(PINCODES);
  return cities
    .map((city) => ({
      ...city,
      areas: areas
        .filter((a) => a.cityId === city.id)
        .map((area) => ({ ...area, pincodes: pincodes.filter((p) => p.areaId === area.id).sort((a, b) => a.pincode.localeCompare(b.pincode)) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Whether a given PIN code is currently serviceable: it, its area and its
// city must all exist and be active. Exported for the visibility rule engine
// to use later; not wired into it yet.
function isPincodeServiceable(pincode) {
  const p = jsonStore.readAll(PINCODES).find((x) => x.pincode === String(pincode || "").trim());
  if (!p || p.active === false) return false;
  const area = jsonStore.readAll(AREAS).find((a) => a.id === p.areaId);
  if (!area || area.active === false) return false;
  const city = jsonStore.readAll(CITIES).find((c) => c.id === area.cityId);
  return Boolean(city && city.active !== false);
}

// ---- cities ----

function createCity({ name, active }, actor) {
  const clean = cleanName(name, "City");
  if (jsonStore.readAll(CITIES).some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
    throw fail(409, "A city with that name already exists");
  }
  const city = jsonStore.insert(CITIES, { name: clean, active: active !== false });
  store.recordAdminChange({ actor, action: "location.city.add", entityType: "location_city", entityId: city.id, entityName: city.name });
  return { ...city, areas: [] };
}

function updateCity(id, { name, active }, actor) {
  const existing = jsonStore.readAll(CITIES).find((c) => c.id === id);
  if (!existing) return undefined;
  const patch = {};
  if (name !== undefined) {
    const clean = cleanName(name, "City");
    if (jsonStore.readAll(CITIES).some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) {
      throw fail(409, "A city with that name already exists");
    }
    patch.name = clean;
  }
  if (active !== undefined) patch.active = Boolean(active);
  const updated = jsonStore.update(CITIES, id, patch);
  const changes = diff(existing, updated, ["name", "active"]);
  if (changes.length) store.recordAdminChange({ actor, action: "location.city.update", entityType: "location_city", entityId: id, entityName: updated.name, changes });
  return updated;
}

function deleteCity(id, actor) {
  const existing = jsonStore.readAll(CITIES).find((c) => c.id === id);
  if (!existing) return false;
  const areaIds = jsonStore.readAll(AREAS).filter((a) => a.cityId === id).map((a) => a.id);
  jsonStore.readAll(PINCODES).filter((p) => areaIds.includes(p.areaId)).forEach((p) => jsonStore.remove(PINCODES, p.id));
  areaIds.forEach((areaId) => jsonStore.remove(AREAS, areaId));
  jsonStore.remove(CITIES, id);
  store.recordAdminChange({ actor, action: "location.city.delete", entityType: "location_city", entityId: id, entityName: existing.name });
  return true;
}

// ---- areas ----

function createArea({ cityId, name, active }, actor) {
  const city = jsonStore.readAll(CITIES).find((c) => c.id === cityId);
  if (!city) throw fail(400, "Choose a city");
  const clean = cleanName(name, "Area");
  if (jsonStore.readAll(AREAS).some((a) => a.cityId === cityId && a.name.toLowerCase() === clean.toLowerCase())) {
    throw fail(409, "That city already has an area with this name");
  }
  const area = jsonStore.insert(AREAS, { cityId, name: clean, active: active !== false });
  store.recordAdminChange({ actor, action: "location.area.add", entityType: "location_area", entityId: area.id, entityName: `${clean} (${city.name})` });
  return { ...area, pincodes: [] };
}

function updateArea(id, { name, active }, actor) {
  const existing = jsonStore.readAll(AREAS).find((a) => a.id === id);
  if (!existing) return undefined;
  const patch = {};
  if (name !== undefined) {
    const clean = cleanName(name, "Area");
    if (jsonStore.readAll(AREAS).some((a) => a.id !== id && a.cityId === existing.cityId && a.name.toLowerCase() === clean.toLowerCase())) {
      throw fail(409, "That city already has an area with this name");
    }
    patch.name = clean;
  }
  if (active !== undefined) patch.active = Boolean(active);
  const updated = jsonStore.update(AREAS, id, patch);
  const changes = diff(existing, updated, ["name", "active"]);
  if (changes.length) store.recordAdminChange({ actor, action: "location.area.update", entityType: "location_area", entityId: id, entityName: updated.name, changes });
  return updated;
}

function deleteArea(id, actor) {
  const existing = jsonStore.readAll(AREAS).find((a) => a.id === id);
  if (!existing) return false;
  jsonStore.readAll(PINCODES).filter((p) => p.areaId === id).forEach((p) => jsonStore.remove(PINCODES, p.id));
  jsonStore.remove(AREAS, id);
  store.recordAdminChange({ actor, action: "location.area.delete", entityType: "location_area", entityId: id, entityName: existing.name });
  return true;
}

// ---- pincodes ----

function createPincode({ areaId, pincode, active }, actor) {
  const area = jsonStore.readAll(AREAS).find((a) => a.id === areaId);
  if (!area) throw fail(400, "Choose an area");
  const clean = cleanPincode(pincode);
  if (jsonStore.readAll(PINCODES).some((p) => p.pincode === clean)) {
    throw fail(409, `PIN code ${clean} is already assigned to another area`);
  }
  const row = jsonStore.insert(PINCODES, { areaId, pincode: clean, active: active !== false });
  store.recordAdminChange({ actor, action: "location.pincode.add", entityType: "location_pincode", entityId: row.id, entityName: `${clean} (${area.name})` });
  return row;
}

function updatePincode(id, { pincode, active }, actor) {
  const existing = jsonStore.readAll(PINCODES).find((p) => p.id === id);
  if (!existing) return undefined;
  const patch = {};
  if (pincode !== undefined) {
    const clean = cleanPincode(pincode);
    if (jsonStore.readAll(PINCODES).some((p) => p.id !== id && p.pincode === clean)) {
      throw fail(409, `PIN code ${clean} is already assigned to another area`);
    }
    patch.pincode = clean;
  }
  if (active !== undefined) patch.active = Boolean(active);
  const updated = jsonStore.update(PINCODES, id, patch);
  const changes = diff(existing, updated, ["pincode", "active"]);
  if (changes.length) store.recordAdminChange({ actor, action: "location.pincode.update", entityType: "location_pincode", entityId: id, entityName: updated.pincode, changes });
  return updated;
}

function deletePincode(id, actor) {
  const existing = jsonStore.readAll(PINCODES).find((p) => p.id === id);
  if (!existing) return false;
  jsonStore.remove(PINCODES, id);
  store.recordAdminChange({ actor, action: "location.pincode.delete", entityType: "location_pincode", entityId: id, entityName: existing.pincode });
  return true;
}

module.exports = {
  tree,
  isPincodeServiceable,
  createCity, updateCity, deleteCity,
  createArea, updateArea, deleteArea,
  createPincode, updatePincode, deletePincode,
};
