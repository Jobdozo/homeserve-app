// Flat illustrations (public/illustrations/*.svg, drawn by scripts/make-illustrations.mjs) used when
// there's no photo: for categories that have no photo yet, and for the common service types in the
// "Select a service" tiles. A picture the team uploads always wins over these.
const CATEGORY_ART = new Set([
  "home-maintenance",
  "gas-chimney-services",
  "water-tank-cleaning",
  "masonry-services",
  "interior-services",
  "domestic-help",
  "ro-water-purifier-services",
  "laundry-services",
  "security-services",
  "gardening-services",
]);

export const categoryIllustration = (categoryId) => (CATEGORY_ART.has(categoryId) ? `/illustrations/cat-${categoryId}.svg` : null);

// Which drawing suits a type, from its name. AC types are matched only inside AC categories so that
// a plain "Service" tile elsewhere doesn't get an air-conditioner.
const SALON = [
  [/wax/i, "waxing"],
  [/bleach|d-?\s?tan/i, "bleach-detan"],
  [/facial/i, "facial"],
  [/clean\s?-?ups?/i, "cleanup"],
  [/manicure|pedicure|mani-?pedi|nail/i, "manicure-pedicure"],
  [/massage/i, "massage"],
  [/polish/i, "body-polishing"],
  [/thread/i, "threading"],
  [/hair\s?cut|haircut|barber|trim/i, "haircut"],
];

export function typeIllustration(name, categoryId) {
  const n = String(name || "");
  if (categoryId === "ac-repair") {
    if (/install/i.test(n)) return "/illustrations/type-ac-installation.svg";
    if (/repair|gas/i.test(n)) return "/illustrations/type-ac-repair-gas.svg";
    if (/service|clean|maint/i.test(n)) return "/illustrations/type-ac-service.svg";
    return null;
  }
  const hit = SALON.find(([re]) => re.test(n));
  return hit ? `/illustrations/type-${hit[1]}.svg` : null;
}
