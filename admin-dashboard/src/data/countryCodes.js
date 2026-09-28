// India-only for now — Tikdum launched in India first, so phone login only
// accepts Indian numbers. Add more entries to RAW (and drop the single-item
// assumption in PhoneInput.jsx) when expanding to other countries.
function flag(iso2) {
  return iso2.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const RAW = [["IN", "+91", "India"]];

export const COUNTRY_CODES = RAW.map(([iso2, dial, name]) => ({ iso2, dial, name, flag: flag(iso2) }));

export function detectDefaultCountry() {
  return "IN";
}
