import { StarIcon, ChevronRightIcon } from "./icons";

// Desktop-only account page: your details and numbers on the left, the account
// menu as cards on the right. The phone version lives in ProfileScreen.
export default function DesktopProfile({ customer, identity, stats, menuItems, onOpen, onEdit, onLogout, onDelete }) {
  return (
    <div className="pb-20">
      <section className="bg-gradient-to-b from-brand-light/70 via-white to-white">
        <div className="mx-auto max-w-6xl px-8 pb-6 pt-12">
          <h1 className="text-[40px] font-extrabold leading-tight tracking-tight text-gray-900">My account</h1>
          <p className="mt-2 text-[16px] text-gray-500">Your details, addresses and help — all in one place.</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-[340px_1fr] items-start gap-8 px-8 pt-4">
        {/* Left: who you are */}
        <aside className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-brand to-brand-dark p-7 text-center text-white shadow-card">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-[48px]">{customer?.avatar || "🧑"}</div>
            <p className="mt-4 truncate text-[22px] font-extrabold">{customer?.name}</p>
            {identity && <p className="mt-1 text-[14px] text-white/75">{identity}</p>}
            <button onClick={onEdit} className="mt-5 rounded-xl bg-white px-6 py-2.5 text-[14px] font-bold text-brand-dark hover:bg-gray-50">
              Edit profile
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white px-2 py-4 shadow-card">
              <p className="text-[24px] font-extrabold text-gray-900">{stats.total}</p>
              <p className="mt-0.5 text-[12px] text-gray-400">Bookings</p>
            </div>
            <div className="rounded-2xl bg-white px-2 py-4 shadow-card">
              <p className="text-[24px] font-extrabold text-gray-900">{stats.completed}</p>
              <p className="mt-0.5 text-[12px] text-gray-400">Completed</p>
            </div>
            <div className="rounded-2xl bg-white px-2 py-4 shadow-card">
              {stats.avgRating ? (
                <p className="flex items-center justify-center gap-1 text-[24px] font-extrabold text-gray-900">
                  <StarIcon filled width={18} height={18} />
                  {stats.avgRating}
                </p>
              ) : (
                <p className="text-[24px] font-extrabold text-gray-900">{stats.ratedCount}</p>
              )}
              <p className="mt-0.5 text-[12px] text-gray-400">{stats.avgRating ? "Rating you give" : "Reviews"}</p>
            </div>
          </div>

          <button onClick={onLogout} className="w-full rounded-2xl border border-red-200 bg-white py-3 text-[14px] font-semibold text-red-600 hover:bg-red-50">
            Logout
          </button>
        </aside>

        {/* Right: account menu */}
        <section>
          <div className="grid grid-cols-2 gap-4">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => onOpen(item)}
                className="group flex items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light text-[22px]">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15.5px] font-bold text-gray-900">{item.label}</span>
                    {item.badge && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${item.badge.className}`}>{item.badge.text}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-gray-400">{item.desc}</span>
                </span>
                <ChevronRightIcon width={16} height={16} className="flex-shrink-0 text-gray-300 group-hover:text-brand" />
              </button>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-6 py-4">
            <div>
              <p className="text-[14px] font-semibold text-gray-800">Delete your account</p>
              <p className="text-[12.5px] text-gray-400">Permanently removes your account. This can't be undone.</p>
            </div>
            <button onClick={onDelete} className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-600 hover:border-red-300 hover:text-red-600">
              Delete account
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
