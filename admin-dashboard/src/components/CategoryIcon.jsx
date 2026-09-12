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

const glyphs = {
  "home-cleaning": (c) => (
    <>
      <path d="M12 3.5c1 1.6 3.2 4.7 3.2 7.2a3.2 3.2 0 1 1-6.4 0c0-2.5 2.2-5.6 3.2-7.2Z" fill={c} />
      <circle cx="7" cy="16.5" r="1" fill={c} opacity="0.6" />
      <circle cx="17" cy="15" r="1.3" fill={c} opacity="0.6" />
    </>
  ),
  "ac-repair": (c) => (
    <>
      <rect x="3.5" y="8" width="17" height="7" rx="2" fill={c} />
      <rect x="6" y="15.3" width="3" height="4.2" rx="1" fill={c} opacity="0.55" />
      <rect x="10.5" y="15.3" width="3" height="5.4" rx="1" fill={c} opacity="0.55" />
      <rect x="15" y="15.3" width="3" height="4.2" rx="1" fill={c} opacity="0.55" />
      <circle cx="17" cy="11.5" r="1.6" fill="#fff" />
    </>
  ),
  plumbing: (c) => (
    <>
      <path
        d="M12 3.8c1.6 2.4 4.6 6.9 4.6 9.9a4.6 4.6 0 1 1-9.2 0c0-3 3-7.5 4.6-9.9Z"
        fill={c}
      />
      <path d="M9.6 14.6a2.5 2.5 0 0 0 2.4 2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  electrician: (c) => <path d="M13 2 4.5 13.5h5.2L10.6 22 19.5 10h-5.3L13 2Z" fill={c} />,
  "appliance-repair": (c) => (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" fill={c} />
      <circle cx="12" cy="13.2" r="4.5" fill="#fff" />
      <circle cx="12" cy="13.2" r="2.6" fill={c} />
      <circle cx="7" cy="6.3" r="1" fill="#fff" />
      <circle cx="10.4" cy="6.3" r="1" fill="#fff" />
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
  "packers-movers": (c) => (
    <>
      <rect x="3.5" y="9" width="17" height="10.5" rx="1.5" fill={c} />
      <path d="M3.5 9 7 4.5h10L20.5 9" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="10.5" y="9" width="3" height="10.5" fill="#fff" opacity="0.5" />
    </>
  ),
  "computer-repair": (c) => (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" fill={c} />
      <rect x="6" y="7" width="12" height="6" rx="0.5" fill="#fff" opacity="0.85" />
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

export default function CategoryIcon({ categoryId, size = 40, rounded = "rounded-2xl", className = "", transparent = false }) {
  const { bg, fg } = palette[categoryId] || palette["more-services"];
  const draw = glyphs[categoryId] || glyphs["more-services"];

  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center ${rounded} ${className}`}
      style={{ width: size, height: size, background: transparent ? "transparent" : bg }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        {draw(fg)}
      </svg>
    </span>
  );
}
