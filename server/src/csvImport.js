// Admin CSV import: parse -> validate every row -> (unless dryRun) create the
// valid ones, reporting every problem row by its line number so a bad file
// never half-fails silently.
const store = require("./store");

const MAX_ROWS = 2000;
const MAX_ERRORS_RETURNED = 200;

// RFC 4180-style parser: quoted fields, escaped quotes (""), commas and
// newlines inside quotes, CRLF or LF, optional UTF-8 BOM.
function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (record.some((v) => v.trim() !== "")) records.push({ line: recordLine, values: record });
    record = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) return { error: "The file has an unclosed quoted field (a \" without a matching closing quote)." };
  if (field !== "" || record.length > 0) endRecord();
  return { records };
}

function normHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// Canonical form is "+<country code><number>". A bare 10-digit number is
// assumed Indian (+91) — which is also what a provider's/customer's WhatsApp
// login sends, so an imported record links up with their real login.
function cleanPhone(raw) {
  const compact = String(raw || "").replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(compact)) return null;
  if (compact.startsWith("+")) return compact;
  if (compact.length === 10) return "+91" + compact;
  return "+" + compact;
}

// Duplicate checks compare the last 10 digits, so "+91 98765 43210",
// "9876543210" and "098765 43210" are all recognised as the same person.
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const isWholeNumber = (v) => /^\d+$/.test(String(v).trim());

const MODULES = {
  categories: {
    columns: ["name", "icon"],
    required: ["name"],
    async prepare() {
      const existing = await store.listCategories();
      return { names: new Set(existing.map((c) => c.name.toLowerCase())), seen: new Set() };
    },
    validate(row, ctx) {
      const name = row.name.trim();
      if (name.length > 60) return { error: "name is longer than 60 characters" };
      const key = name.toLowerCase();
      if (ctx.names.has(key)) return { error: `Category "${name}" already exists` };
      if (ctx.seen.has(key)) return { error: `Category "${name}" appears more than once in this file` };
      const icon = (row.icon || "").trim();
      if (icon.length > 8) return { error: "icon should be a single emoji or a short symbol" };
      ctx.seen.add(key);
      return { data: { name, icon: icon || null } };
    },
    create: (d) => store.createCategory(d),
  },

  customers: {
    columns: ["name", "phone"],
    required: ["name", "phone"],
    async prepare() {
      const existing = await store.listCustomers();
      return { phones: new Set(existing.map((c) => digits(c.phone))), seen: new Set() };
    },
    validate(row, ctx) {
      const name = row.name.trim();
      if (name.length > 100) return { error: "name is longer than 100 characters" };
      const phone = cleanPhone(row.phone);
      if (!phone) return { error: `"${row.phone}" is not a valid phone number (8–15 digits, optional leading +)` };
      const key = digits(phone);
      if (ctx.phones.has(key)) return { error: `A customer with phone ${phone} already exists` };
      if (ctx.seen.has(key)) return { error: `Phone ${phone} appears more than once in this file` };
      ctx.seen.add(key);
      return { data: { name, phone } };
    },
    create: (d) => store.createCustomer(d),
  },

  providers: {
    columns: ["name", "phone", "category"],
    required: ["name", "phone"],
    async prepare() {
      const [providers, categories] = await Promise.all([store.listProviders(), store.listCategories()]);
      return {
        phones: new Set(providers.map((p) => digits(p.phone))),
        categories,
        seen: new Set(),
      };
    },
    validate(row, ctx) {
      const name = row.name.trim();
      if (name.length > 100) return { error: "name is longer than 100 characters" };
      const phone = cleanPhone(row.phone);
      if (!phone) return { error: `"${row.phone}" is not a valid phone number (8–15 digits, optional leading +)` };
      const key = digits(phone);
      if (ctx.phones.has(key)) return { error: `A provider with phone ${phone} already exists` };
      if (ctx.seen.has(key)) return { error: `Phone ${phone} appears more than once in this file` };
      let category;
      const rawCategory = (row.category || "").trim();
      if (rawCategory) {
        const match = ctx.categories.find(
          (c) => c.name.toLowerCase() === rawCategory.toLowerCase() || c.id === rawCategory.toLowerCase()
        );
        if (!match) return { error: `Unknown category "${rawCategory}" — use an existing category name` };
        category = match.name;
      }
      ctx.seen.add(key);
      return { data: { name, phone, category } };
    },
    create: (d) => store.adminCreateProvider(d),
  },

  services: {
    columns: ["provider_phone", "category", "name", "price", "original_price"],
    required: ["provider_phone", "category", "name", "price"],
    async prepare() {
      const [providers, categories] = await Promise.all([store.listProviders(), store.listCategories()]);
      return {
        providersByPhone: new Map(providers.map((p) => [digits(p.phone), p])),
        categories,
        seen: new Set(),
      };
    },
    validate(row, ctx) {
      const phone = cleanPhone(row.provider_phone);
      if (!phone) return { error: `"${row.provider_phone}" is not a valid provider phone number` };
      const provider = ctx.providersByPhone.get(digits(phone));
      if (!provider) return { error: `No provider found with phone ${phone} — import the provider first` };
      const rawCategory = row.category.trim();
      const category = ctx.categories.find(
        (c) => c.id === rawCategory.toLowerCase() || c.name.toLowerCase() === rawCategory.toLowerCase()
      );
      if (!category) return { error: `Unknown category "${rawCategory}"` };
      const name = row.name.trim();
      if (name.length > 120) return { error: "name is longer than 120 characters" };
      if (!isWholeNumber(row.price)) return { error: `price "${row.price}" must be a whole number of rupees` };
      const price = Number(row.price);
      let originalPrice;
      const rawOriginal = (row.original_price || "").trim();
      if (rawOriginal) {
        if (!isWholeNumber(rawOriginal)) return { error: `original_price "${rawOriginal}" must be a whole number of rupees` };
        originalPrice = Number(rawOriginal);
        if (originalPrice < price) return { error: "original_price can't be lower than price" };
      }
      const dupKey = `${provider.id}|${category.id}|${name.toLowerCase()}`;
      if (ctx.seen.has(dupKey)) return { error: `"${name}" is listed more than once for ${provider.name}` };
      ctx.seen.add(dupKey);
      return { data: { providerId: provider.id, categorySlug: category.id, name, price, originalPrice } };
    },
    create: (d) =>
      store.adminCreateService(d.providerId, {
        categorySlug: d.categorySlug,
        name: d.name,
        price: d.price,
        originalPrice: d.originalPrice,
      }),
  },
};

async function run(moduleName, csvText, dryRun) {
  const mod = MODULES[moduleName];
  if (!mod) return { fatal: `Import isn't available for "${moduleName}"` };

  const parsed = parseCsv(csvText);
  if (parsed.error) return { fatal: parsed.error };
  if (parsed.records.length === 0) return { fatal: "The file is empty." };

  const header = parsed.records[0].values.map(normHeader);
  const missing = mod.required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      fatal: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected columns: ${mod.columns.join(", ")}.`,
    };
  }
  const ignoredColumns = header.filter((h) => h && !mod.columns.includes(h));
  const dataRows = parsed.records.slice(1);
  if (dataRows.length === 0) return { fatal: "The file has a header row but no data rows." };
  if (dataRows.length > MAX_ROWS) return { fatal: `Too many rows (${dataRows.length}). Import at most ${MAX_ROWS} at a time.` };

  const ctx = await mod.prepare();
  const errors = [];
  const valid = [];
  for (const rec of dataRows) {
    const row = {};
    header.forEach((h, i) => {
      row[h] = (rec.values[i] ?? "").toString();
    });
    if (rec.values.length > header.length && rec.values.slice(header.length).some((v) => v.trim() !== "")) {
      errors.push({ row: rec.line, message: "This row has more values than the header has columns" });
      continue;
    }
    const emptyRequired = mod.required.filter((c) => !row[c] || row[c].trim() === "");
    if (emptyRequired.length > 0) {
      errors.push({ row: rec.line, message: `Missing required value${emptyRequired.length > 1 ? "s" : ""}: ${emptyRequired.join(", ")}` });
      continue;
    }
    const result = mod.validate(row, ctx);
    if (result.error) errors.push({ row: rec.line, message: result.error });
    else valid.push({ line: rec.line, data: result.data });
  }

  let imported = 0;
  if (!dryRun) {
    for (const item of valid) {
      try {
        await mod.create(item.data);
        imported++;
      } catch (e) {
        errors.push({ row: item.line, message: `Couldn't save this row: ${e.message || "unknown error"}` });
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);
  return {
    module: moduleName,
    dryRun: !!dryRun,
    total: dataRows.length,
    valid: valid.length,
    imported,
    failed: errors.length,
    ignoredColumns,
    errors: errors.slice(0, MAX_ERRORS_RETURNED),
    errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
  };
}

module.exports = { run, parseCsv, MODULES };
