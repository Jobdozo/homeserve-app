import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// The tikdum.com blog (server: blog.js). The SEO Agent's drafts arrive here — read, edit, then
// publish (or approve its proposal in AI Agents → Approvals). People can write articles too.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const SITE = "https://tikdum.com";
const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

// The same small format the website shows: "## " headings, "- " lists, **bold**.
function Preview({ body }) {
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ t: "p", v: para.join(" ") });
    if (list) blocks.push({ t: "ul", v: list });
    para = [];
    list = null;
  };
  for (const raw of String(body || "").split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (/^#{2,3}\s+/.test(line)) {
      flush();
      blocks.push({ t: "h2", v: line.replace(/^#{2,3}\s+/, "") });
    } else if (/^[-*•]\s+/.test(line)) {
      if (para.length) (blocks.push({ t: "p", v: para.join(" ") }), (para = []));
      (list = list || []).push(line.replace(/^[-*•]\s+/, ""));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  const rich = (s) => s.split(/(\*\*.+?\*\*)/g).map((p, i) => (/^\*\*.+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
  return (
    <div className="max-w-[68ch] space-y-3 text-[14px] leading-[1.7] text-gray-700">
      {blocks.map((b, i) =>
        b.t === "h2" ? (
          <h3 key={i} className="pt-1 text-[16px] font-bold text-gray-900">{b.v}</h3>
        ) : b.t === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">{b.v.map((x, j) => <li key={j}>{rich(x)}</li>)}</ul>
        ) : (
          <p key={i}>{rich(b.v)}</p>
        )
      )}
    </div>
  );
}

function Editor({ article, onSave, onCancel, busy }) {
  const [f, setF] = useState({ title: article?.title || "", description: article?.description || "", category: article?.category || "", coverUrl: article?.coverUrl || "", body: article?.body || "", faqs: article?.faqs || [] });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const words = f.body.split(/\s+/).filter(Boolean).length;
  const setFaq = (i, k, v) => setF((p) => ({ ...p, faqs: p.faqs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  return (
    <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), onSave({ ...f, faqs: f.faqs.filter((x) => x.q && x.a) }))}>
      <label className="block">
        <span className={labelCls}>Title (what people search for — max 65 characters is best)</span>
        <input className={inputCls} value={f.title} onChange={set("title")} required minLength={10} maxLength={90} />
      </label>
      <label className="block">
        <span className={labelCls}>Description (shown on Google — max 155 characters)</span>
        <input className={inputCls} value={f.description} onChange={set("description")} maxLength={170} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Category (adds a "Book" button)</span>
          <input className={inputCls} value={f.category} onChange={set("category")} placeholder="e.g. Appliance Repair" />
        </label>
        <label>
          <span className={labelCls}>Cover picture address</span>
          <input className={inputCls} value={f.coverUrl} onChange={set("coverUrl")} placeholder="https://api.tikdum.com/uploads/…" />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Article — "## " for a heading, "- " for a list, **bold** · {words} words</span>
        <textarea className={`${inputCls} min-h-[320px] font-mono text-[12.5px] leading-relaxed`} value={f.body} onChange={set("body")} required />
      </label>
      <div>
        <span className={labelCls}>Questions & answers</span>
        <div className="space-y-2">
          {f.faqs.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input className={inputCls} value={x.q} onChange={(e) => setFaq(i, "q", e.target.value)} placeholder="Question" />
              <input className={inputCls} value={x.a} onChange={(e) => setFaq(i, "a", e.target.value)} placeholder="Answer" />
              <button type="button" onClick={() => setF((p) => ({ ...p, faqs: p.faqs.filter((_, j) => j !== i) }))} className="rounded-xl px-3 text-[12px] font-semibold text-gray-400 hover:text-red-600">
                Remove
              </button>
            </div>
          ))}
          {f.faqs.length < 6 && (
            <button type="button" onClick={() => setF((p) => ({ ...p, faqs: [...p.faqs, { q: "", a: "" }] }))} className="text-[12.5px] font-semibold text-brand">
              + Add a question
            </button>
          )}
        </div>
      </div>
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

function ArticleCard({ a, open, onToggle, onEdit, run, can }) {
  const live = a.status === "published";
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        {a.coverUrl ? <img src={a.coverUrl} alt="" className="h-16 w-24 flex-shrink-0 rounded-lg object-cover" /> : <div className="h-16 w-24 flex-shrink-0 rounded-lg bg-gray-100" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{live ? `Live since ${when(a.publishedAt)}` : "Draft"}</span>
            <span className="text-gray-400">{a.readMinutes} min read · {String(a.by || "").replace(" [AI agent]", " (AI)")}</span>
          </div>
          <p className="mt-1 text-[14px] font-bold text-gray-900">{a.title}</p>
          <p className="line-clamp-2 text-[12.5px] text-gray-500">{a.description}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4">
          <Preview body={a.body} />
          {a.faqs?.length > 0 && (
            <div className="mt-4 space-y-2">
              {a.faqs.map((f) => (
                <p key={f.q} className="text-[13px] text-gray-700">
                  <strong>{f.q}</strong> {f.a}
                </p>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {can("blog.approve") && !live && (
              <button onClick={() => window.confirm(`Publish "${a.title}" on tikdum.com/blog?`) && run(() => api.publishBlogArticle(a.id), "Published")} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white">
                Publish
              </button>
            )}
            {live && (
              <a href={`${SITE}/blog/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white">
                Open on tikdum.com ↗
              </a>
            )}
            {can("blog.edit") && (
              <button onClick={onEdit} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                Edit
              </button>
            )}
            {can("blog.edit") && live && (
              <button onClick={() => window.confirm("Take this article off the website? It stays here as a draft.") && run(() => api.unpublishBlogArticle(a.id), "Back to draft")} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                Unpublish
              </button>
            )}
            {can("blog.delete") && (
              <button onClick={() => window.confirm(`Delete "${a.title}"? This can't be undone.`) && run(() => api.deleteBlogArticle(a.id), "Deleted")} className="ml-auto rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-gray-400 hover:text-red-600">
                Delete
              </button>
            )}
          </div>
          {!live && <p className="mt-2 text-[11.5px] text-gray-400">An SEO Agent draft can also be published by approving it in AI Agents → Approvals.</p>}
        </div>
      )}
    </div>
  );
}

// Approval first (default), or the SEO Agent publishes by itself up to N a day.
// Google AdSense on the blog only (server/src/blogAds.js).
function AdsPanel() {
  const { showToast, can } = useApp();
  const [ads, setAds] = useState(null);
  const [id, setId] = useState("");
  useEffect(() => {
    api.getBlogAds().then((a) => (setAds(a), setId(a.client || ""))).catch(() => {});
  }, []);
  if (!ads) return null;
  const canEdit = can("blog.manage");
  const save = async (patch, msg) => {
    try {
      const a = await api.setBlogAds(patch);
      setAds(a);
      setId(a.client || "");
      showToast(msg);
    } catch (e) {
      showToast(e.message || "Couldn't save");
    }
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[620px]">
          <h2 className="text-[14px] font-bold text-gray-900">Ads (Google AdSense)</h2>
          <p className="text-[12px] leading-snug text-gray-500">
            {ads.on
              ? <>Google shows ads on <b>tikdum.com/blog</b> and its articles only — never on booking, checkout, accounts or the Android app. tikdum.com/ads.txt names publisher {ads.client}.</>
              : ads.client
                ? "Ads are paused: no blog page loads AdSense. ads.txt stays in place."
                : "Paste your AdSense publisher ID (AdSense → Account → Account information, it starts with ca-pub-) to show Google ads on the blog only. You can paste AdSense's whole code; the ID is taken from it."}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ca-pub-1234567890123456" className="w-[230px] rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-[12px]" />
            <button onClick={() => save({ client: id, on: true }, "Ads on for the blog")} disabled={!id.trim() || (id.trim() === ads.client && ads.on)} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
              Save
            </button>
            {ads.client && (
              <button onClick={() => save({ on: !ads.on }, ads.on ? "Ads paused" : "Ads on for the blog")} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                {ads.on ? "Pause ads" : "Turn ads on"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AutoPublishPanel() {
  const { showToast, can } = useApp();
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.getAiConfig().then(setCfg).catch(() => {});
  }, []);
  if (!cfg) return null;
  const canEdit = can("ai.manage");
  const save = async (patch, msg) => {
    try {
      setCfg(await api.setAiConfig(patch));
      showToast(msg);
    } catch (e) {
      showToast(e.message || "Couldn't save");
    }
  };
  const turnOn = () =>
    window.confirm(`The SEO Agent will publish up to ${cfg.blogPerDay} articles a day on tikdum.com by itself, without asking you. Turn on?`) &&
    save({ blogAutoPublish: true }, `Auto-publish on: up to ${cfg.blogPerDay} a day`);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[620px]">
          <h2 className="text-[14px] font-bold text-gray-900">Publishing</h2>
          <p className="text-[12px] leading-snug text-gray-500">
            {cfg.blogAutoPublish
              ? `Auto-publish: the SEO Agent writes and publishes up to ${cfg.blogPerDay} article${cfg.blogPerDay === 1 ? "" : "s"} a day by itself, spread from 7 AM to 9 PM, and skips topics it has already covered. You can edit, unpublish or delete any of them here.`
              : "Approval first: the SEO Agent writes a draft every Tuesday and Friday and waits for someone to publish it."}
          </p>
          {cfg.blogAutoPublish && cfg.blogPerDay > 3 && (
            <p className="mt-1.5 text-[12px] leading-snug text-amber-700">
              Many AI-written articles a day can look like mass-produced content to Google and pull down the whole site's ranking. Keep an eye on Search Console; 1–3 a day is safer.
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
              Articles a day
              <select value={cfg.blogPerDay} onChange={(e) => save({ blogPerDay: Number(e.target.value) }, `${e.target.value} article(s) a day`)} className="rounded-lg border border-gray-200 px-2 py-1 text-[12px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex rounded-xl border border-gray-200 p-0.5">
              <button className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${!cfg.blogAutoPublish ? "bg-brand text-white" : "text-gray-500"}`} onClick={() => cfg.blogAutoPublish && save({ blogAutoPublish: false }, "Articles wait for approval again")}>
                Approval first
              </button>
              <button className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${cfg.blogAutoPublish ? "bg-brand text-white" : "text-gray-500"}`} onClick={() => !cfg.blogAutoPublish && turnOn()}>
                Auto-publish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlogPage() {
  const { showToast, can } = useApp();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | article
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.listBlogArticles().then(setList).catch((e) => showToast(e.message || "Couldn't load the blog")), [showToast]);
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
  const save = async (data) => {
    const ok = await run(() => (editing === "new" ? api.addBlogArticle(data) : api.updateBlogArticle(editing.id, data)), "Saved");
    if (ok) setEditing(null);
  };
  const drafts = (list || []).filter((a) => a.status !== "published");
  const live = (list || []).filter((a) => a.status === "published");
  return (
    <div className="space-y-4">
      <AutoPublishPanel />
      <AdsPanel />
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[640px] text-[12px] leading-snug text-gray-500">
            Articles at <a href={`${SITE}/blog`} target="_blank" rel="noreferrer" className="font-semibold text-brand">tikdum.com/blog</a> bring people from Google to Tikdum. The SEO Agent writes a draft every Tuesday and Friday (or for a task titled "Blog: …"); read it here, edit if needed, and publish. The Marketing Agent then shares it on Facebook and Instagram.
          </p>
          {can("blog.add") && (
            <button onClick={() => setEditing("new")} className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">
              + Write an article
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <h3 className="mb-3 text-[14px] font-bold text-gray-900">{editing === "new" ? "New article (saved as a draft)" : `Edit "${editing.title}"`}</h3>
          <Editor key={editing === "new" ? "new" : editing.id} article={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
        </div>
      )}
      {!list ? (
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      ) : (
        <>
          <h2 className="text-[13px] font-bold text-gray-700">Drafts ({drafts.length})</h2>
          {drafts.length ? drafts.map((a) => <ArticleCard key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} onEdit={() => (setEditing(a), window.scrollTo({ top: 0, behavior: "smooth" }))} run={run} can={can} />) : <p className="text-[12.5px] text-gray-400">No drafts waiting.</p>}
          <h2 className="pt-2 text-[13px] font-bold text-gray-700">On the website ({live.length})</h2>
          {live.length ? live.map((a) => <ArticleCard key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} onEdit={() => (setEditing(a), window.scrollTo({ top: 0, behavior: "smooth" }))} run={run} can={can} />) : <p className="text-[12.5px] text-gray-400">Nothing published yet.</p>}
        </>
      )}
    </div>
  );
}
