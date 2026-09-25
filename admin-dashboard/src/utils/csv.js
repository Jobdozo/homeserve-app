// Cells starting with = + - @ (or a tab/CR) are treated as formulas by Excel /
// Sheets — prefix them with a quote so exported user-typed text (names,
// review text, ...) can never execute when the file is opened.
function escapeCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// columns: [[header, keyOrFn], ...]
export function toCsv(columns, rows) {
  const lines = [columns.map(([header]) => escapeCell(header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map(([, accessor]) => escapeCell(typeof accessor === "function" ? accessor(row) : row[accessor]))
        .join(",")
    );
  }
  return lines.join("\r\n");
}

// Union of every top-level key across the rows, for API shapes we export as-is.
export function columnsFromRows(rows) {
  const keys = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  return keys.map((k) => [k, k]);
}

export function downloadCsv(filename, csvText) {
  // BOM so Excel opens UTF-8 (₹, emoji, Hindi names) correctly.
  const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}
