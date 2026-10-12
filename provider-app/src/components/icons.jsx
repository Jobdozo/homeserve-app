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

export const AlertIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const HomeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </svg>
);

export const RequestsIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
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

export const WalletIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="6" width="17" height="13" rx="2" />
    <path d="M3.5 10h17" />
    <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
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

export const PlusIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const FilterIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const CameraIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <circle cx="12" cy="13" r="3.2" />
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

export const ShieldCheckIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const EditIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M13.5 8l2.5 2.5" />
  </svg>
);

export const LogoutIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const OrdersIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

export const InsightsIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const ToolIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />
  </svg>
);

export const RupeeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M7 5h10M7 10h10M13 19 7 10h2a4 4 0 0 0 0-5" />
  </svg>
);

export const GrowIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const ChatIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const NavigateIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11l19-9-9 19-2-8-8-2z" />
  </svg>
);

export const MenuIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const ChevronDownIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const TagIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export const MegaphoneIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
    <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
  </svg>
);

export const LinkIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

export const UsersIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.7" />
  </svg>
);

export const DocIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

export const DownloadIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

export const InfoIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const StoreIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 10h18M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 10v10h14V10" />
    <path d="M9 20v-5h6v5" />
  </svg>
);

export const QrIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v.01M14 21h7v-4" />
  </svg>
);

export const SettingsIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
