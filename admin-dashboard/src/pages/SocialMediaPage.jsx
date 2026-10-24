import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Facebook & Instagram (server: social.js, marketingCalendar.js): every post with the results
// read back from Meta twice a day, and the festival & season calendar the Marketing Agent
// plans its posts from. Auto-post and the formats are switched in AI Agents → Approvals.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FORMAT = { single: "Picture", carousel: "Carousel", story: "Story" };

const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function totals(m = {}) {
  const f = m.facebook || {};
  const i = m.instagram || {};
  return {
    likes: (f.reactions || 0) + (i.likes || 0),
    comments: (f.comments || 0) + (i.comments || 0),
    shares: (f.shares || 0) + (i.shares || 0),
    saves: i.saved || 0,
    reach: (f.reach || 0) + (i.reach || 0),
  };
}

function PostCard({ p }) {
  const t = totals(p.metrics);
  const links = Object.entries(p.results || {}).filter(([, r]) => r.ok && r.link);
  const failed = Object.entries(p.results || {}).filter(([, r]) => !r.ok);
  return (
    <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
      <div className={`relative flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 ${p.format === "story" ? "h-[128px] w-[72px]" : "h-[96px] w-[96px]"}`}>
        {p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {p.format === "carousel" && <span className="absolute right-1 top-1 rounded-md bg-black/60 px-1.5 text-[10.5px] font-bold text-white">1/{p.images?.length || "…"}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{FORMAT[p.format || "single"]}</span>
          {p.fresh && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">New picture</span>}
          <span className="text-gray-400">{when(p.at)} · {String(p.by || "").replace(" [AI agent]", " (AI)")}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-gray-800">{p.format === "story" ? p.storyLine : p.title ? `${p.title} — ${p.caption}` : p.caption}</p>
        {p.format !== "story" && (
          <p className="mt-1.5 text-[12px] font-semibold tabular-nums text-gray-700">
            {p.metrics ? (
              <>
                ❤ {t.likes} · 💬 {t.comments} · ↗ {t.shares}
                {t.saves ? ` · 🔖 ${t.saves}` : ""}
                {t.reach ? <span className="font-medium text-gray-500"> · reached {t.reach.toLocaleString("en-IN")}</span> : null}
              </>
            ) : (
              <span className="font-medium text-gray-400">Results come in within 12 hours</span>
            )}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] font-semibold">
          {links.map(([k, r]) => (
            <a key={k} href={r.link} target="_blank" rel="noreferrer" className="text-brand">
              {k === "facebook" ? "Facebook" : "Instagram"} ↗
            </a>
          ))}
          {failed.map(([k, r]) => (
            <span key={k} className="text-red-600" title={r.error}>
              {k === "facebook" ? "Facebook" : "Instagram"} failed
            </span>
          ))}
          {p.metrics?.errors?.length ? <span className="text-amber-700" title={p.metrics.errors.join("\n")}>Some results unreadable</span> : null}
        </div>
      </div>
    </div>
  );
}

function PostsTab({ posts, onRefresh, busy, canEdit }) {
  const week = useMemo(() => {
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const list = posts.filter((p) => Date.parse(p.at) >= since);
    const feed = list.filter((p) => p.format !== "story");
    const t = feed.reduce((a, p) => {
      const x = totals(p.metrics);
      return { likes: a.likes + x.likes, comments: a.comments + x.comments, shares: a.shares + x.shares };
    }, { likes: 0, comments: 0, shares: 0 });
    return { posts: feed.length, stories: list.length - feed.length, ...t };
  }, [posts]);
  const best = useMemo(() => posts.filter((p) => p.metrics && p.format !== "story").sort((a, b) => (b.metrics.score || 0) - (a.metrics.score || 0))[0], [posts]);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-gray-900">Last 7 days</h2>
          {canEdit && (
            <button onClick={onRefresh} disabled={busy} className="rounded-xl bg-gray-100 px-3.5 py-2 text-[12.5px] font-semibold text-gray-700 disabled:opacity-60">
              {busy ? "Reading results…" : "Refresh results"}
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Posts", week.posts],
            ["Stories", week.stories],
            ["Likes", week.likes],
            ["Comments", week.comments],
            ["Shares", week.shares],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-[20px] font-extrabold tabular-nums text-gray-900">{v}</p>
              <p className="text-[11.5px] font-semibold text-gray-500">{k}</p>
            </div>
          ))}
        </div>
        {best && <p className="mt-2 text-[12px] text-gray-500">Best so far: “{(best.topic || best.title || best.caption).slice(0, 80)}”. The agent is shown its best and worst posts each time it writes, and moves its posting times to the hours that do best.</p>}
      </div>
      {posts.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-gray-400">No posts yet.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {posts.map((p) => (
            <PostCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY = { kind: "event", name: "", date: "", yearly: "", leadDays: 7, ideas: "", confirm: false, months: [] };

function CalendarForm({ initial, onSave, onCancel, busy }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, date: initial?.date || "", yearly: initial?.yearly || "", months: initial?.months || [] });
  const [repeat, setRepeat] = useState(initial?.yearly ? "yearly" : "once");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const season = f.kind === "season";
  const toggleMonth = (m) => setF((p) => ({ ...p, months: p.months.includes(m) ? p.months.filter((x) => x !== m) : [...p.months, m] }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (season) return onSave({ kind: "season", name: f.name, ideas: f.ideas, months: f.months });
        const yearly = repeat === "yearly" ? (f.date ? f.date.slice(5) : f.yearly) : null;
        onSave({ kind: "event", name: f.name, ideas: f.ideas, confirm: f.confirm, leadDays: Number(f.leadDays), date: repeat === "once" ? f.date : null, yearly });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className={labelCls}>Type</span>
          <select className={inputCls} value={f.kind} onChange={set("kind")} disabled={Boolean(initial?.id)}>
            <option value="event">Festival or special day</option>
            <option value="season">Season</option>
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Name</span>
          <input className={inputCls} value={f.name} onChange={set("name")} placeholder={season ? "e.g. Exam season" : "e.g. Karva Chauth"} required maxLength={60} />
        </label>
      </div>
      {season ? (
        <div>
          <span className={labelCls}>Months</span>
          <div className="flex flex-wrap gap-1.5">
            {MONTHS.map((m, i) => (
              <button type="button" key={m} onClick={() => toggleMonth(i + 1)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${f.months.includes(i + 1) ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={labelCls}>Date</span>
            <input className={inputCls} type="date" value={f.date || (f.yearly ? `${new Date().getFullYear()}-${f.yearly}` : "")} onChange={set("date")} required />
          </label>
          <label>
            <span className={labelCls}>Repeats</span>
            <select className={inputCls} value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="once">Just this date (festivals that move)</option>
              <option value="yearly">Same day every year</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>Start posting (days before)</span>
            <input className={inputCls} type="number" min="1" max="30" value={f.leadDays} onChange={set("leadDays")} />
          </label>
        </div>
      )}
      <label className="block">
        <span className={labelCls}>Post ideas — services that fit</span>
        <input className={inputCls} value={f.ideas} onChange={set("ideas")} placeholder="e.g. Deep cleaning, salon at home, electrician for lights" maxLength={400} />
      </label>
      {!season && (
        <label className="flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={f.confirm} onChange={set("confirm")} className="h-4 w-4 accent-brand" />
          Date depends on the moon — the agent won't state the exact day
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl bg-gray-100 px-4 py-2.5 text-[13px] font-semibold text-gray-700">
          Cancel
        </button>
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function CalendarTab({ entries, canEdit, run }) {
  const [editing, setEditing] = useState(null);
  const events = entries.filter((e) => e.kind === "event");
  const seasons = entries.filter((e) => e.kind === "season");
  const month = new Date().getMonth() + 1;
  const save = async (data) => {
    const ok = await run(() => (editing === "new" ? api.addSocialCalendar(data) : api.updateSocialCalendar(editing.id, data)), "Saved");
    if (ok) setEditing(null);
  };
  const remove = (e) => window.confirm(`Remove ${e.name} from the calendar?`) && run(() => api.deleteSocialCalendar(e.id), "Removed");
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[640px] text-[12px] leading-snug text-gray-500">
            The Marketing Agent writes about a festival from the number of days you set before it, and only names festivals listed here — so if a date is wrong, fix it here. Seasons steer which services it posts about.
          </p>
          {canEdit && (
            <button onClick={() => setEditing("new")} className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">
              + Add
            </button>
          )}
        </div>
        {editing && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <CalendarForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <h3 className="border-b border-gray-100 px-4 py-3 text-[13px] font-bold text-gray-900">Festivals &amp; special days</h3>
        {events.map((e) => {
          const soon = e.next && e.next.daysAway <= (e.leadDays || 7);
          return (
            <div key={e.id} className={`flex flex-wrap items-center gap-3 border-b border-gray-50 px-4 py-2.5 ${e.next ? "" : "opacity-50"}`}>
              <div className="w-[150px] flex-shrink-0">
                <p className="text-[13px] font-semibold tabular-nums text-gray-800">{e.next ? fmtDate(e.next.date) : fmtDate(e.date)}</p>
                <p className="text-[11px] text-gray-400">{e.next ? (e.next.daysAway === 0 ? "Today" : `in ${e.next.daysAway} days`) : "Past"}{e.yearly ? " · every year" : ""}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-gray-900">
                  {e.name}
                  {soon && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">Posting now</span>}
                  {e.confirm && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Date to confirm</span>}
                </p>
                <p className="text-[12px] text-gray-500">{e.ideas} · from {e.leadDays || 7} days before</p>
              </div>
              {canEdit && (
                <div className="flex gap-1.5">
                  <button onClick={() => (setEditing(e), window.scrollTo({ top: 0, behavior: "smooth" }))} className="rounded-lg bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-700">
                    Edit
                  </button>
                  <button onClick={() => remove(e)} className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-gray-400 hover:text-red-600">
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <h3 className="border-b border-gray-100 px-4 py-3 text-[13px] font-bold text-gray-900">Seasons in J&amp;K</h3>
        {seasons.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-4 py-2.5">
            <p className="w-[150px] flex-shrink-0 text-[12px] font-semibold text-gray-600">{(s.months || []).map((m) => MONTHS[m - 1]).join(", ")}</p>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-gray-900">
                {s.name}
                {(s.months || []).includes(month) && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">Now</span>}
              </p>
              <p className="text-[12px] text-gray-500">{s.ideas}</p>
            </div>
            {canEdit && (
              <div className="flex gap-1.5">
                <button onClick={() => (setEditing(s), window.scrollTo({ top: 0, behavior: "smooth" }))} className="rounded-lg bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-700">
                  Edit
                </button>
                <button onClick={() => remove(s)} className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-gray-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SocialMediaPage() {
  const { showToast, can } = useApp();
  const canEdit = can("social.add");
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => Promise.all([api.listSocialPosts(100).then(setPosts), api.listSocialCalendar().then(setCalendar)]).catch((e) => showToast(e.message || "Couldn't load social media")),
    [showToast]
  );
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await load();
      return true;
    } catch (e) {
      showToast(e.message || "Couldn't save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto">
        {[
          ["posts", "Posts & results"],
          ["calendar", "Festival calendar"],
        ].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${tab === k ? "bg-brand text-white" : "bg-white text-gray-600 shadow-card"}`}>
            {v}
          </button>
        ))}
      </div>
      {!posts || !calendar ? (
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      ) : tab === "posts" ? (
        <PostsTab posts={posts} busy={busy} canEdit={canEdit} onRefresh={() => run(() => api.refreshSocialResults(), "Results updated")} />
      ) : (
        <CalendarTab entries={calendar} canEdit={canEdit} run={run} />
      )}
    </div>
  );
}
