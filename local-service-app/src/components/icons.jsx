// Minimal stroke-icon set so the prototype has no external icon dependency.
const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const HomeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </svg>
);

export const BookingsIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
);

export const GridIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1.3" />
    <rect x="14" y="4" width="6" height="6" rx="1.3" />
    <rect x="4" y="14" width="6" height="6" rx="1.3" />
    <rect x="14" y="14" width="6" height="6" rx="1.3" />
  </svg>
);

export const ChatIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M21 12a7.5 7.5 0 0 1-11.4 6.4L4 20l1.7-4.6A7.5 7.5 0 1 1 21 12Z" />
  </svg>
);

export const ProfileIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c1.5-3.8 5-5 7.5-5s6 1.2 7.5 5" />
  </svg>
);

export const BackIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20 16 16" />
  </svg>
);

export const BellIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const StarIcon = ({ filled, ...p }) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill={filled ? "#F59E0B" : "none"}
    stroke={filled ? "#F59E0B" : "#D1D5DB"}
    strokeWidth={1.5}
    {...p}
  >
    <path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.3 6.6L12 17.3l-5.9 3.1 1.3-6.6-4.9-4.5 6.6-.7Z" />
  </svg>
);

export const ChevronRightIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const CheckIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export const XIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ShieldCheckIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const CartIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 4h2l1.6 10.6a2 2 0 0 0 2 1.7h8.2a2 2 0 0 0 2-1.6L20.2 8H6" />
    <circle cx="9.5" cy="20" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const PhoneIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 4h3.5l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2C10.6 21 3 13.4 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const SendIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);

export const CalendarIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
);

export const ClockIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const MapPinIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

export const HeartIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
);

export const TagIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 12l8-8 8 8-8 8-8-8z" />
    <path d="M10 10l4 4M14 10h.01M10 14h.01" />
  </svg>
);

export const NoteIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h5" />
  </svg>
);

export const LockIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const UmbrellaIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 12a8 8 0 0 1 16 0H4z" />
    <path d="M12 12v6a2 2 0 0 0 4 0" />
  </svg>
);

export const ArrowRightIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const SlidersIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const CashIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const CrosshairIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const ShareIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1" />
  </svg>
);

export const ListIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);

export const UserPlusIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
  </svg>
);
