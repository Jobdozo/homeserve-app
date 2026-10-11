import { useState } from "react";
import DeleteAccountModal from "../components/DeleteAccountModal";
import EditProfileModal from "../components/EditProfileModal";
import DesktopProfile from "../components/DesktopProfile";
import useIsDesktop from "../utils/useIsDesktop";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ChevronRightIcon, StarIcon, MapPinIcon, TagIcon, UmbrellaIcon, ChatIcon, NoteIcon, LockIcon, ShieldCheckIcon } from "../components/icons";
import { initials } from "../components/ui";

export default function ProfileScreen() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { customer, bookings, logout } = useApp();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const completed = bookings.filter((b) => b.status === "Completed").length;

  // Real numbers only: the average is of the star ratings this customer has
  // actually given, and is left out until they've given one.
  const rated = bookings.filter((b) => Number(b.review?.rating) > 0);
  const avgRating = rated.length ? (rated.reduce((n, b) => n + Number(b.review.rating), 0) / rated.length).toFixed(1) : null;

  const menuItems = [
    {
      icon: "📍",
      Icon: MapPinIcon,
      label: "Saved Addresses",
      desc: "Your home and office addresses",
      path: "/address",
      badge: customer?.address
        ? { text: `PIN ${customer.address.pincode}`, className: "bg-mist text-ink-muted" }
        : { text: "Set PIN code", className: "bg-marigold-light text-marigold-dark" },
    },
    { icon: "🎁", Icon: TagIcon, label: "Refer & Earn", desc: "Invite friends and earn credit", path: "/refer", tone: "marigold" },
    { icon: "🛡️", Icon: UmbrellaIcon, label: "Booking Protection", desc: "How your bookings are covered", path: "/booking-protection", tone: "trust" },
    { icon: "❓", Icon: ChatIcon, label: "Help & Support", desc: "Get help with a booking", path: "/profile/help" },
    { icon: "ℹ️", Icon: ShieldCheckIcon, label: "About Tikdum", desc: "Who we are and how it works", href: "/about.html" },
    { icon: "📄", Icon: NoteIcon, label: "Terms & Conditions", desc: "The rules for using Tikdum", href: "/terms.html" },
    { icon: "🔒", Icon: LockIcon, label: "Privacy Policy", desc: "How we handle your information", href: "/privacy.html" },
  ];
  const tones = { marigold: "bg-marigold-light text-marigold-dark", trust: "bg-trust-light text-trust" };

  const open = (item) => (item.path ? navigate(item.path) : window.open(item.href, "_blank"));
  const identity = customer?.phone || customer?.email || "";

  return (
    <>
      {isDesktop && (
        <div className="hidden lg:block">
          <DesktopProfile
            customer={customer}
            identity={identity}
            stats={{ total: bookings.length, completed, ratedCount: rated.length, avgRating }}
            menuItems={menuItems}
            onOpen={open}
            onEdit={() => setEditing(true)}
            onLogout={logout}
            onDelete={() => setDeleting(true)}
          />
        </div>
      )}

      <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-4 lg:hidden">
        {/* who you are, on the night-violet band */}
        <div className="bg-brand-night px-4 pb-16 pt-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-marigold font-display text-[24px] font-extrabold text-ink">
              {customer?.name ? initials(customer.name) : customer?.avatar || "🙂"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[22px] font-extrabold text-white">{customer?.name || "Your profile"}</p>
              <p className="text-[13px] text-[#C9C0F2]">{identity}</p>
            </div>
            <button onClick={() => setEditing(true)} className="flex-shrink-0 rounded-full bg-white/10 px-4 py-2 text-[13px] font-bold text-white active:scale-95">
              Edit
            </button>
          </div>
        </div>

        <div className="relative -mt-11 mx-4 grid grid-cols-3 divide-x divide-line rounded-[20px] bg-white py-3.5 text-center shadow-lift">
          <button onClick={() => navigate("/bookings")} className="flex flex-col items-center">
            <span className="font-display text-[22px] font-extrabold text-ink">{bookings.length}</span>
            <span className="text-[11.5px] text-ink-muted">Bookings</span>
          </button>
          <div className="flex flex-col items-center">
            <span className="font-display text-[22px] font-extrabold text-ink">{completed}</span>
            <span className="text-[11.5px] text-ink-muted">Completed</span>
          </div>
          <div className="flex flex-col items-center">
            {avgRating ? (
              <span className="flex items-center gap-1 font-display text-[22px] font-extrabold text-ink">
                {avgRating}
                <StarIcon filled width={15} height={15} fill="#12804A" stroke="#12804A" />
              </span>
            ) : (
              <span className="font-display text-[22px] font-extrabold text-ink">{rated.length}</span>
            )}
            <span className="text-[11.5px] text-ink-muted">{avgRating ? "Your ratings" : "Reviews given"}</span>
          </div>
        </div>

        <div className="mx-4 mt-4 overflow-hidden rounded-[20px] bg-white shadow-card">
          {menuItems.map(({ Icon, ...item }) => (
            <button key={item.label} onClick={() => open(item)} className="flex w-full items-center gap-3 border-b border-[#F0EEF7] px-4 py-3 text-left last:border-0 active:bg-mist">
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[item.tone] || "bg-brand-light text-brand"}`}>
                <Icon width={19} height={19} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14.5px] font-bold text-ink">{item.label}</span>
                <span className="truncate text-[12px] text-ink-muted">{item.desc}</span>
              </span>
              {item.badge && <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${item.badge.className}`}>{item.badge.text}</span>}
              <ChevronRightIcon width={16} height={16} className="flex-shrink-0 text-ink-muted/50" />
            </button>
          ))}
        </div>

        <button onClick={logout} className="mx-4 mt-4 h-12 rounded-2xl bg-white text-[14.5px] font-bold text-red-600 shadow-card active:scale-[0.99]">
          Log out
        </button>
        <button onClick={() => setDeleting(true)} className="mx-4 mt-2 py-2 text-center text-[12.5px] font-medium text-ink-muted underline decoration-dotted">
          Delete account
        </button>
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
      {deleting && <DeleteAccountModal onClose={() => setDeleting(false)} />}
    </>
  );
}
