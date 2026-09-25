const fs = require("fs");
const raw = fs.readFileSync("csvImport.js", "utf8");
const crlf = raw.indexOf("\r\n") !== -1;
let s = raw.split("\r\n").join("\n");
function rep(a, b) { if (!s.includes(a)) throw new Error("missing " + a.slice(0, 50)); s = s.split(a).join(b); }
rep(`function cleanPhone(raw) {
  const compact = String(raw || "").replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(compact)) return null;
  return compact;
}

const digits = (p) => String(p || "").replace(/\D/g, "");`, `// Canonical form is "+<country code><number>". A bare 10-digit number is
// assumed Indian (+91) — this is also what a provider's/customer's WhatsApp
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
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);`);
fs.writeFileSync("csvImport.js", crlf ? s.split("\n").join("\r\n") : s);
