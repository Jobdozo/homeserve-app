import { useApp } from "../context/AppContext";

// Flat, brand-styled category illustrations — a real icon system instead of
// raw emoji glyphs, keyed by categoryId so every screen stays in sync.

const palette = {
  "home-cleaning": { bg: "#DCFCE7", fg: "#16A34A" },
  "ac-repair": { bg: "#DBEAFE", fg: "#2563EB" },
  plumbing: { bg: "#E0F2FE", fg: "#0891B2" },
  electrician: { bg: "#FEF3C7", fg: "#D97706" },
  "appliance-repair": { bg: "#E0E7FF", fg: "#4F46E5" },
  carpentry: { bg: "#FFEDD5", fg: "#C2410C" },
  painting: { bg: "#FCE7F3", fg: "#DB2777" },
  "pest-control": { bg: "#D1FAE5", fg: "#059669" },
  "salon-spa": { bg: "#FCE7F3", fg: "#DB2777" },
  "packers-movers": { bg: "#EDE9FE", fg: "#7C3AED" },
  "computer-repair": { bg: "#E0E7FF", fg: "#4338CA" },
  "more-services": { bg: "#F3F4F6", fg: "#4B5563" },
};

// Each glyph takes (primary, accent) — accent is the inner-detail color,
// which needs to invert along with primary so highlight details never
// disappear (e.g. a white highlight drawn on a now-white icon in vivid
// mode) — see the component below for how the two modes assign them.
const glyphs = {
  "home-cleaning": (c, a) => (
    <>
      <path d="M12 3.5c1 1.6 3.2 4.7 3.2 7.2a3.2 3.2 0 1 1-6.4 0c0-2.5 2.2-5.6 3.2-7.2Z" fill={c} />
      <circle cx="7" cy="16.5" r="1" fill={c} opacity="0.6" />
      <circle cx="17" cy="15" r="1.3" fill={c} opacity="0.6" />
    </>
  ),
  "ac-repair": (c, a) => (
    <>
      <rect x="3.5" y="8" width="17" height="7" rx="2" fill={c} />
      <rect x="6" y="15.3" width="3" height="4.2" rx="1" fill={c} opacity="0.55" />
      <rect x="10.5" y="15.3" width="3" height="5.4" rx="1" fill={c} opacity="0.55" />
      <rect x="15" y="15.3" width="3" height="4.2" rx="1" fill={c} opacity="0.55" />
      <circle cx="17" cy="11.5" r="1.6" fill={a} />
    </>
  ),
  plumbing: (c, a) => (
    <>
      <path
        d="M12 3.8c1.6 2.4 4.6 6.9 4.6 9.9a4.6 4.6 0 1 1-9.2 0c0-3 3-7.5 4.6-9.9Z"
        fill={c}
      />
      <path d="M9.6 14.6a2.5 2.5 0 0 0 2.4 2" stroke={a} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  electrician: (c) => <path d="M13 2 4.5 13.5h5.2L10.6 22 19.5 10h-5.3L13 2Z" fill={c} />,
  "appliance-repair": (c, a) => (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" fill={c} />
      <circle cx="12" cy="13.2" r="4.5" fill={a} />
      <circle cx="12" cy="13.2" r="2.6" fill={c} />
      <circle cx="7" cy="6.3" r="1" fill={a} />
      <circle cx="10.4" cy="6.3" r="1" fill={a} />
    </>
  ),
  carpentry: (c) => (
    <>
      <rect x="2.8" y="14.5" width="13" height="3.2" rx="1" transform="rotate(-35 2.8 14.5)" fill={c} />
      <rect x="12" y="3.5" width="4" height="9" rx="1" transform="rotate(20 12 3.5)" fill={c} opacity="0.75" />
      <circle cx="17.5" cy="17.5" r="3.3" fill={c} opacity="0.55" />
    </>
  ),
  painting: (c) => (
    <>
      <rect x="4" y="4" width="12" height="6" rx="1.5" fill={c} />
      <rect x="8" y="10" width="4" height="4" fill={c} />
      <path d="M8.5 14c-1.8 0-3 1.4-3 3.2 0 1.7 1.3 2.8 2.6 2.8 1.6 0 2.7-1.3 2.4-3.1-.2-1.2-1-2-2-2.9Z" fill={c} opacity="0.7" />
      <rect x="16.2" y="5" width="3" height="3" fill={c} opacity="0.5" />
    </>
  ),
  "pest-control": (c) => (
    <>
      <ellipse cx="12" cy="13" rx="3.6" ry="5.2" fill={c} />
      <circle cx="12" cy="7" r="2.2" fill={c} />
      <path d="M5 10l3-1.4M5 14l3 .2M5 18l3-1.6M19 10l-3-1.4M19 14l-3 .2M19 18l-3-1.6" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  "salon-spa": (c) => (
    <>
      <circle cx="8" cy="7" r="2.4" fill="none" stroke={c} strokeWidth="1.6" />
      <circle cx="8" cy="17" r="2.4" fill="none" stroke={c} strokeWidth="1.6" />
      <path d="M19 5 9.6 12 19 19" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  "packers-movers": (c, a) => (
    <>
      <rect x="3.5" y="9" width="17" height="10.5" rx="1.5" fill={c} />
      <path d="M3.5 9 7 4.5h10L20.5 9" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="10.5" y="9" width="3" height="10.5" fill={a} opacity="0.5" />
    </>
  ),
  "computer-repair": (c, a) => (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" fill={c} />
      <rect x="6" y="7" width="12" height="6" rx="0.5" fill={a} opacity="0.85" />
      <rect x="8" y="18" width="8" height="1.8" rx="0.9" fill={c} />
    </>
  ),
  "more-services": (c) => (
    <>
      <circle cx="6.5" cy="12" r="2" fill={c} />
      <circle cx="12" cy="12" r="2" fill={c} />
      <circle cx="17.5" cy="12" r="2" fill={c} />
    </>
  ),
};

// Categories added later from the admin panel have no drawn glyph. They show
// their own emoji instead (set in admin, otherwise guessed from the name) on a
// colour picked from the category id, so each one is distinct and recognisable.
const EMOJI_BY_KEYWORD = [
  [/water tank|tank/, "🛢️"],
  [/purifier|ro|water/, "💧"],
  [/laundry|wash|dry ?clean|iron/, "👕"],
  [/garden|lawn|plant/, "🌿"],
  [/security|guard|cctv|camera/, "🛡️"],
  [/gas|chimney|stove|kitchen/, "🔥"],
  [/mason|brick|tile|construct|civil/, "🧱"],
  [/interior|decor|furnitur|design/, "🛋️"],
  [/domestic|maid|cook|nanny|babysit|help/, "🧑‍🍳"],
  [/maintenance|repair|fix|handyman/, "🛠️"],
  [/clean/, "🧹"],
  [/car|auto|vehicle|bike/, "🚗"],
  [/beauty|salon|spa|massage/, "💆"],
  [/tutor|teach|class|coaching/, "📚"],
  [/photo|video|event/, "📷"],
  [/pet|dog|cat/, "🐾"],
  [/health|nurse|physio|care/, "🩺"],
];
const TINTS = [
  { bg: "#DBEAFE", fg: "#2563EB" },
  { bg: "#DCFCE7", fg: "#16A34A" },
  { bg: "#FEF3C7", fg: "#D97706" },
  { bg: "#FCE7F3", fg: "#DB2777" },
  { bg: "#EDE9FE", fg: "#7C3AED" },
  { bg: "#CFFAFE", fg: "#0891B2" },
  { bg: "#FFEDD5", fg: "#C2410C" },
  { bg: "#E0E7FF", fg: "#4F46E5" },
];

function tintFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function emojiFor(category, id) {
  if (category?.icon) return category.icon;
  const text = `${category?.name || ""} ${id}`.toLowerCase().replace(/[-_/]/g, " ");
  const hit = EMOJI_BY_KEYWORD.find(([re]) => re.test(text));
  return hit ? hit[1] : "✨";
}

// "soft" (default) is the pastel-tile treatment used for small in-context
// icons (category grid, list rows). "vivid" is the full-bleed card treatment
// — a gradient built from the category's own color with a white glyph on
// top, the same color+white-icon language as the Tikdum logo itself — used
// wherever a service/category gets real visual real estate (service cards,
// detail headers) instead of every card collapsing into one flat brand-light
// box regardless of category.
export default function CategoryIcon({
  categoryId,
  size = 40,
  rounded = "rounded-2xl",
  className = "",
  transparent = false,
  variant = "soft",
  fill = false,
}) {
  const { categories } = useApp();
  const vivid = variant === "vivid";
  const glyphSize = size * (vivid ? 0.42 : 0.56);
  // "more-services" is the deliberate three-dot glyph; anything else without a
  // drawing gets its emoji.
  const custom = !glyphs[categoryId];
  const { bg, fg } = custom ? tintFor(categoryId) : palette[categoryId];
  const draw = glyphs[categoryId];
  const emoji = custom ? emojiFor(categories?.find((c) => c.id === categoryId), categoryId) : null;

  const background = vivid
    ? `linear-gradient(135deg, ${fg}b3, ${fg})`
    : transparent
      ? "transparent"
      : bg;

  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center ${rounded} ${fill ? "h-full w-full" : ""} ${className}`}
      style={fill ? { background } : { width: size, height: size, background }}
    >
      {emoji ? (
        <span aria-hidden="true" style={{ fontSize: glyphSize * (vivid ? 1.25 : 1), lineHeight: 1 }}>
          {emoji}
        </span>
      ) : (
        <svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none">
          {draw(vivid ? "#fff" : fg, vivid ? fg : "#fff")}
        </svg>
      )}
    </span>
  );
}
