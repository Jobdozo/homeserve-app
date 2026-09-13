// Regional indicator symbols start at U+1F1E6 for 'A', so a flag emoji is
// just the two-letter ISO code shifted into that range — no need to store
// 190 emoji by hand.
function flag(iso2) {
  return iso2.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const RAW = [
  ["IN", "+91", "India"],
  ["US", "+1", "United States"],
  ["CA", "+1", "Canada"],
  ["GB", "+44", "United Kingdom"],
  ["AU", "+61", "Australia"],
  ["AE", "+971", "United Arab Emirates"],
  ["SA", "+966", "Saudi Arabia"],
  ["SG", "+65", "Singapore"],
  ["MY", "+60", "Malaysia"],
  ["PK", "+92", "Pakistan"],
  ["BD", "+880", "Bangladesh"],
  ["NP", "+977", "Nepal"],
  ["LK", "+94", "Sri Lanka"],
  ["ID", "+62", "Indonesia"],
  ["PH", "+63", "Philippines"],
  ["TH", "+66", "Thailand"],
  ["VN", "+84", "Vietnam"],
  ["CN", "+86", "China"],
  ["JP", "+81", "Japan"],
  ["KR", "+82", "South Korea"],
  ["DE", "+49", "Germany"],
  ["FR", "+33", "France"],
  ["IT", "+39", "Italy"],
  ["ES", "+34", "Spain"],
  ["NL", "+31", "Netherlands"],
  ["BE", "+32", "Belgium"],
  ["CH", "+41", "Switzerland"],
  ["SE", "+46", "Sweden"],
  ["NO", "+47", "Norway"],
  ["DK", "+45", "Denmark"],
  ["FI", "+358", "Finland"],
  ["IE", "+353", "Ireland"],
  ["PT", "+351", "Portugal"],
  ["PL", "+48", "Poland"],
  ["RU", "+7", "Russia"],
  ["TR", "+90", "Turkey"],
  ["IL", "+972", "Israel"],
  ["EG", "+20", "Egypt"],
  ["ZA", "+27", "South Africa"],
  ["NG", "+234", "Nigeria"],
  ["KE", "+254", "Kenya"],
  ["BR", "+55", "Brazil"],
  ["MX", "+52", "Mexico"],
  ["AR", "+54", "Argentina"],
  ["CL", "+56", "Chile"],
  ["CO", "+57", "Colombia"],
  ["NZ", "+64", "New Zealand"],
  ["QA", "+974", "Qatar"],
  ["KW", "+965", "Kuwait"],
  ["OM", "+968", "Oman"],
  ["BH", "+973", "Bahrain"],
];

export const COUNTRY_CODES = RAW.map(([iso2, dial, name]) => ({ iso2, dial, name, flag: flag(iso2) }));

export function detectDefaultCountry() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const match = COUNTRY_CODES.find((c) => c.iso2 === region);
    if (match) return match.iso2;
  } catch {
    // Intl.Locale not supported or language tag had no usable region — fall through.
  }
  return "IN";
}
