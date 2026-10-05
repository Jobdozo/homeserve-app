import { useState } from "react";
import DeleteAccountModal from "../components/DeleteAccountModal";
import EditProfileModal from "../components/EditProfileModal";
import DesktopProfile from "../components/DesktopProfile";
import useIsDesktop from "../utils/useIsDesktop";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ChevronRightIcon, StarIcon } from "../components/icons";

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
      label: "Saved Addresses",
      desc: "Your home and office addresses",
      path: "/address",
      badge: customer?.address
        ? { text: `PIN ${customer.address.pincode}`, className: "bg-gray-100 text-gray-600" }
        : { text: "Set PIN code", className: "bg-amber-100 text-amber-700" },
    },
    { icon: "🎁", label: "Refer & Earn", desc: "Invite friends and earn credit", path: "/refer" },
    { icon: "🛡️", label: "Booking Protection", desc: "How your bookings are covered", path: "/booking-protection" },
    { icon: "❓", label: "Help & Support", desc: "Get help with a booking", path: "/profile/help" },
    { icon: "ℹ️", label: "About Tikdum", desc: "Who we are and how it works", href: "/about.html" },
    { icon: "📄", label: "Terms & Conditions", desc: "The rules for using Tikdum", href: "/terms.html" },
    { icon: "🔒", label: "Privacy Policy", desc: "How we handle your information", href: "/privacy.html" },
  ];

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

      <div className="flex flex-1 flex-col pb-4 lg:hidden">
        <h1 className="px-4 pt-1 text-lg font-bold text-gray-900">Profile</h1>

        <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-4 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-2xl">{customer?.avatar || "🧑"}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{customer?.name}</p>
            <p className="text-[11.5px] text-white/75">{identity}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex-shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white">
            Edit
          </button>
        </div>

        <div className="mx-4 mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white py-3 shadow-card">
            <p className="text-lg font-extrabold text-gray-900">{bookings.length}</p>
            <p className="text-[10.5px] text-gray-400">Total Bookings</p>
          </div>
          <div className="rounded-xl bg-white py-3 shadow-card">
            <p className="text-lg font-extrabold text-gray-900">{completed}</p>
            <p className="text-[10.5px] text-gray-400">Completed</p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl bg-white py-3 shadow-card">
            {avgRating ? (
              <div className="flex items-center gap-1">
                <StarIcon filled width={14} height={14} />
                <p className="text-lg font-extrabold text-gray-900">{avgRating}</p>
              </div>
            ) : (
              <p className="text-lg font-extrabold text-gray-900">{rated.length}</p>
            )}
            <p className="text-[10.5px] text-gray-400">{avgRating ? "Rating you give" : "Reviews given"}</p>
          </div>
        </div>

        <div className="mx-4 mt-4 divide-y divide-gray-100 rounded-2xl bg-white shadow-card">
          {menuItems.map((item) => (
            <button key={item.label} onClick={() => open(item)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50">
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1 text-[13px] font-medium text-gray-700">{item.label}</span>
              {item.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.badge.className}`}>{item.badge.text}</span>}
              <ChevronRightIcon width={16} height={16} className="text-gray-300" />
            </button>
          ))}
        </div>

        <button onClick={logout} className="mx-4 mt-4 rounded-2xl border border-red-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50">
          Logout
        </button>
        <button onClick={() => setDeleting(true)} className="mx-4 mt-3 py-2 text-center text-[12.5px] font-medium text-gray-400 underline">
          Delete account
        </button>
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
      {deleting && <DeleteAccountModal onClose={() => setDeleting(false)} />}
    </>
  );
}
