const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const DashboardIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" />
    <rect x="13" y="10" width="7.5" height="10.5" rx="1.5" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

export const UsersIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c1.2-3.2 3.8-5 6-5s4.8 1.8 6 5" />
    <circle cx="17" cy="8" r="2.4" />
    <path d="M16 12.2c2 .3 3.7 1.8 4.6 4.3" />
  </svg>
);

export const ShieldCheckIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z" />
    <path d="M9 12l2 2 4-4" />
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

export const RequestIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

export const MapPinIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

export const CalendarIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
);

export const WalletIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="6" width="17" height="13" rx="2" />
    <path d="M3.5 10h17" />
    <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const PercentIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 19 19 5" />
    <circle cx="7" cy="7" r="2.3" />
    <circle cx="17" cy="17" r="2.3" />
  </svg>
);

export const StarIcon = ({ filled, ...p }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill={filled ? "#F59E0B" : "none"}
    stroke={filled ? "#F59E0B" : "#D1D5DB"}
    strokeWidth={1.5}
    {...p}
  >
    <path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.3 6.6L12 17.3l-5.9 3.1 1.3-6.6-4.9-4.5 6.6-.7Z" />
  </svg>
);

export const AlertIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const BellIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const ChartIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 19V9M11 19V4M18 19v-7" />
  </svg>
);

export const CameraIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

export const FileIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3h8l4 4v14H6Z" />
    <path d="M14 3v4h4" />
  </svg>
);

export const SettingsIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </svg>
);

export const ArchiveIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4" width="17" height="4.5" rx="1" />
    <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
    <path d="M10 12.5h4" />
  </svg>
);

export const SupportIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
    <path d="M5.5 5.5l3.3 3.3M18.5 5.5l-3.3 3.3M5.5 18.5l3.3-3.3M18.5 18.5l-3.3-3.3" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </svg>
);

export const MenuIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const ChevronRightIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const ChevronDownIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 9l7 7 7-7" />
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

export const TrendUpIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 16l5.5-6 4 4L20 6" />
    <path d="M14 6h6v6" />
  </svg>
);

export const TrendDownIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8l5.5 6 4-4L20 18" />
    <path d="M14 18h6v-6" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const LogoutIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
