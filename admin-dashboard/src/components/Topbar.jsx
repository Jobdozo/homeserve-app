import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BellIcon, SearchIcon, MenuIcon, CalendarIcon } from "./icons";
import CategoryIcon from "./CategoryIcon";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Topbar({ title, subtitle, onMenuClick }) {
  const { activities, services, providers, bookings, logout } = useApp();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const today = new Date();
  const rangeLabel = `${today.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${new Date(
    today.getTime() + 6 * 86400000
  ).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return { svc: [], prov: [], book: [] };
    return {
      svc: services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 4),
      prov: providers.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, 4),
      book: bookings.filter((b) => b.id.toLowerCase().includes(q) || b.customer?.name.toLowerCase().includes(q)).slice(0, 4),
    };
  }, [q, services, providers, bookings]);
  const hasResults = results.svc.length || results.prov.length || results.book.length;

  const goTo = (path) => {
    navigate(path);
    setShowResults(false);
    setQuery("");
  };

  return (
    <header className="flex flex-shrink-0 items-center gap-4 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
      >
        <MenuIcon width={18} height={18} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold text-gray-900 sm:text-lg">{title}</h1>
        {subtitle && <p className="truncate text-[11.5px] text-gray-400">{subtitle}</p>}
      </div>

      <div className="relative hidden md:block">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] text-gray-400 focus-within:border-brand">
          <SearchIcon width={15} height={15} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="Search services, providers, bookings..."
            className="w-52 bg-transparent text-gray-700 outline-none placeholder:text-gray-400"
          />
        </div>
        {showResults && q && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowResults(false)} />
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
              {!hasResults && <p className="px-2 py-3 text-center text-xs text-gray-400">No matches for "{query}"</p>}
              {results.svc.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Services</p>
                  {results.svc.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => goTo("/services")}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-gray-700 hover:bg-gray-50"
                    >
                      <CategoryIcon categoryId={s.categoryId} size={22} rounded="rounded-md" /> {s.name}
                    </button>
                  ))}
                </div>
              )}
              {results.prov.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Providers</p>
                  {results.prov.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goTo("/providers")}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-gray-700 hover:bg-gray-50"
                    >
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-light text-xs">
                        {p.avatar}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {results.book.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Bookings</p>
                  {results.book.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => goTo("/bookings")}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-gray-700 hover:bg-gray-50"
                    >
                      #{b.id} · {b.customer?.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="hidden items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 xl:flex">
        <CalendarIcon width={14} height={14} className="text-gray-400" />
        {rangeLabel}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowNotifications((v) => !v)}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <BellIcon width={17} height={17} />
          {activities.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {activities.length}
            </span>
          )}
        </button>
        {showNotifications && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs font-bold text-gray-900">Recent Activity</p>
              <div className="no-scrollbar max-h-80 overflow-y-auto">
                {activities.slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded-lg px-2 py-2 text-[12px] text-gray-600 hover:bg-gray-50">
                    <p className="leading-snug text-gray-700">{a.message}</p>
                    <p className="mt-0.5 text-[10.5px] text-gray-400">{timeAgo(a.time)}</p>
                  </div>
                ))}
                {activities.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-400">Nothing yet.</p>}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowAccountMenu((v) => !v)}
          className="flex items-center gap-2 rounded-lg pl-2 hover:bg-gray-50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-base">🧑‍💼</div>
          <div className="hidden text-left sm:block">
            <p className="text-[12.5px] font-semibold text-gray-900">Super Admin</p>
            <p className="text-[10.5px] text-gray-400">Super Administrator</p>
          </div>
        </button>
        {showAccountMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowAccountMenu(false)} />
            <div className="absolute right-0 z-20 mt-2 w-40 rounded-xl border border-gray-100 bg-white p-1 shadow-xl">
              <button
                onClick={logout}
                className="w-full rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
