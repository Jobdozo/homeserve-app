import { useCallback, useEffect, useMemo, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";
import useSubcategories, { reloadSubcategories } from "../utils/useSubcategories";

// Same browser-side shrink the other photo uploads use, so an AI picture is saved at a normal size.
async function shrink(file, maxSide) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "picture.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const KINDS = [
  ["subcategory", "Types"],
  ["category", "Category banners"],
  ["catalog", "Catalog"],
  ["service", "Services"],
];

const AUDIENCES = [
  ["auto", "Auto"],
  ["female", "Woman"],
  ["male", "Man"],
  ["any", "Either"],
];

export default function ImageStudioPanel() {
  const { categories, services, setServiceImage, setCategoryBanner, showToast } = useApp();
  const subs = useSubcategories();
  const [status, setStatus] = useState(null);
  const [kind, setKind] = useState("subcategory");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [audience, setAudience] = useState({}); // id -> auto|female|male|any
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(null); // candidate id being approved

  const catName = (slug) => categories.find((c) => c.id === slug)?.name || "";
  const typeName = (id) => subs.find((x) => x.id === id)?.name || "";

  const loadStatus = useCallback(() => api.getImageStudioStatus().then(setStatus).catch((e) => setStatus({ configured: false, error: e.message })), []);
  const loadCandidates = useCallback(() => api.listImageCandidates().then(setCandidates).catch(() => {}), []);
  useEffect(() => {
    loadStatus();
    loadCandidates();
    api.listServiceCatalog().then(setCatalog).catch(() => {});
    reloadSubcategories().catch(() => {});
  }, [loadStatus, loadCandidates]);

  // While anything is being drawn, keep looking for the result.
  const drawing = candidates.some((c) => c.status === "generating");
  useEffect(() => {
    if (!drawing) return;
    const t = setInterval(() => {
      loadCandidates();
      loadStatus();
    }, 4000);
    return () => clearInterval(t);
  }, [drawing, loadCandidates, loadStatus]);

  // What can be drawn, with what it needs to be told about it.
  const targets = useMemo(() => {
    const open = new Set(candidates.filter((c) => ["generating", "pending"].includes(c.status)).map((c) => `${c.targetType}:${c.targetId}`));
    let rows = [];
    if (kind === "subcategory")
      rows = subs.map((s) => ({ id: s.id, name: s.name, category: catName(s.categoryId), type: "", has: Boolean(s.imageUrl), thumb: s.imageUrl }));
    else if (kind === "category") rows = categories.map((c) => ({ id: c.id, name: c.name, category: "", type: "", has: Boolean(c.bannerUrl), thumb: c.bannerUrl }));
    else if (kind === "catalog")
      rows = catalog.map((i) => ({ id: i.id, name: i.name, category: catName(i.categorySlug), type: typeName(i.subcategoryId), tagline: i.tagline, has: Boolean(i.imageUrl), thumb: i.imageUrl }));
    else rows = services.map((s) => ({ id: s.id, name: s.name, category: catName(s.categoryId), type: typeName(s.subcategoryId), tagline: s.tagline, has: Boolean(s.imageUrl), thumb: s.imageUrl }));
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (!onlyMissing || !r.has) && (!q || `${r.name} ${r.category} ${r.type}`.toLowerCase().includes(q)))
      .map((r) => ({ ...r, busy: open.has(`${kind}:${r.id}`) }));
  }, [kind, onlyMissing, query, subs, categories, catalog, services, candidates]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const generate = async (rows) => {
    const list = rows.filter((r) => !r.busy);
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i += 10) {
        const batch = list.slice(i, i + 10).map((r) => ({
          targetType: kind,
          targetId: r.id,
          name: r.name,
          category: r.category,
          type: r.type,
          tagline: r.tagline,
          audience: audience[r.id] || "auto",
        }));
        await api.generateImages(batch);
      }
      setSelected(new Set());
      await loadCandidates();
      showToast(`Drawing ${list.length} picture${list.length === 1 ? "" : "s"} — they appear below as they finish`);
    } catch (e) {
      showToast(e.message || "Couldn't start");
      await loadCandidates();
    }
    setBusy(false);
  };

  // Approve = take the finished picture, shrink it, and save it the normal way for what it belongs to.
  const approve = async (c) => {
    setWorking(c.id);
    try {
      const blob = await (await fetch(SERVER_URL + c.url)).blob();
      const file = await shrink(new File([blob], "ai.png", { type: blob.type || "image/png" }), c.targetType === "category" ? 1800 : 1000);
      if (c.targetType === "service") await setServiceImage(c.targetId, file);
      else if (c.targetType === "category") await setCategoryBanner(c.targetId, file);
      else if (c.targetType === "catalog") await api.uploadServiceCatalogImage(c.targetId, file);
      else if (c.targetType === "subcategory") {
        await api.uploadSubcategoryImage(c.targetId, file);
        await reloadSubcategories();
      }
      await api.settleImage(c.id, "approved");
      showToast(`"${c.name}" picture saved`);
      if (c.targetType === "catalog") api.listServiceCatalog().then(setCatalog).catch(() => {});
    } catch (e) {
      showToast(e.message || "Couldn't save the picture");
    }
    setWorking(null);
    loadCandidates();
  };

  const discard = async (c, again) => {
    setWorking(c.id);
    try {
      await api.settleImage(c.id, "rejected");
      if (again) {
        await api.generateImages([
          { targetType: c.targetType, targetId: c.targetId, name: c.name, category: c.category, type: c.type, tagline: c.tagline, audience: c.audience === "female" || c.audience === "male" ? c.audience : "auto" },
        ]);
      }
    } catch (e) {
      showToast(e.message || "Couldn't do that");
    }
    setWorking(null);
    loadCandidates();
  };

  const waiting = candidates.filter((c) => ["pending", "generating", "failed"].includes(c.status));
  const input = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-brand";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[14px] font-bold text-gray-900">Image Studio</p>
            <p className="max-w-2xl text-[12px] text-gray-500">
              Gemini draws a picture in Tikdum's style. Women's services show a woman, men's a man, and body services (waxing, massage, polishing) show products only, never a person.
              Nothing is used until you approve it.
            </p>
          </div>
          {status && (
            <span className={"rounded-full px-3 py-1 text-[11.5px] font-semibold " + (status.configured && !status.error ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              {status.configured ? (status.error ? "Gemini key problem" : "Gemini connected") : "Gemini not set up"}
            </span>
          )}
        </div>
        {status && !status.configured && (
          <ol className="mt-3 list-decimal space-y-1 rounded-xl bg-amber-50 p-3 pl-7 text-[12px] text-amber-800">
            <li>Create a key at Google AI Studio (aistudio.google.com → Get API key).</li>
            <li>
              On the server, add <code className="rounded bg-white px-1">GEMINI_API_KEY=your-key</code> to the <code className="rounded bg-white px-1">.env</code> next to docker-compose.yml.
            </li>
            <li>
              Run <code className="rounded bg-white px-1">docker compose -p homeserve up -d server</code>, then refresh this page.
            </li>
          </ol>
        )}
        {status?.error && <p className="mt-2 text-[12px] text-red-600">{status.error}</p>}
        {status?.configured && !status.error && (
          <p className="mt-2 text-[11.5px] text-gray-400">
            Pictures: {status.imageModel || "—"} · check: {status.textModel || "none"} · used today {status.usedToday} of {status.dailyLimit}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-card">
        <div className="flex gap-1 rounded-xl bg-gray-50 p-1">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setSelected(new Set());
              }}
              className={"rounded-lg px-3 py-1.5 text-[12px] font-semibold " + (kind === k ? "bg-brand text-white" : "text-gray-500")}
            >
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className={input + " min-w-[160px] flex-1"} />
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-brand" /> Only without a picture
        </label>
        <span className="text-[12px] text-gray-400">{targets.length} shown</span>
        <button onClick={() => setSelected(new Set(targets.filter((t) => !t.busy).slice(0, 25).map((t) => t.id)))} className="text-[12px] font-semibold text-brand">
          Select first 25
        </button>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-lg">
          <span className="text-[13px] font-semibold">{selected.size} selected</span>
          <button
            disabled={busy || !status?.configured}
            onClick={() => generate(targets.filter((t) => selected.has(t.id)))}
            className="rounded-lg bg-white px-4 py-2 text-[12.5px] font-bold text-gray-900 disabled:opacity-50"
          >
            {busy ? "Starting…" : `Draw ${selected.size} picture${selected.size === 1 ? "" : "s"} →`}
          </button>
        </div>
      )}

      <div className="max-h-[360px] overflow-y-auto rounded-2xl bg-white shadow-card">
        {targets.length === 0 && <p className="p-8 text-center text-[13px] text-gray-400">Nothing to show — everything here already has a picture.</p>}
        {targets.slice(0, 300).map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5 last:border-0">
            <input type="checkbox" checked={selected.has(t.id)} disabled={t.busy} onChange={() => toggle(t.id)} className="h-4 w-4 accent-brand" />
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {t.thumb ? <img src={SERVER_URL + t.thumb} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-gray-300">none</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-gray-800">{t.name}</p>
              <p className="truncate text-[11px] text-gray-400">{[t.category, t.type].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            {t.busy && <span className="text-[11px] font-semibold text-amber-600">in progress</span>}
            <select
              value={audience[t.id] || "auto"}
              onChange={(e) => setAudience((a) => ({ ...a, [t.id]: e.target.value }))}
              className={input + " w-24 py-1 text-[11.5px]"}
              title="Who appears in the picture. Auto decides from the name; body services always show products only."
            >
              {AUDIENCES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {waiting.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-bold text-gray-900">Waiting for your decision ({waiting.length})</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {waiting.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
                <div className="flex aspect-[4/3] items-center justify-center bg-gray-50">
                  {c.status === "generating" && <span className="animate-pulse text-[12px] text-gray-400">Drawing…</span>}
                  {c.status === "failed" && <span className="px-4 text-center text-[12px] text-red-600">{c.error || "Failed"}</span>}
                  {c.url && <img src={SERVER_URL + c.url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold text-gray-900">{c.name}</p>
                    <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-gray-500">{c.targetType}</span>
                  </div>
                  <p className="text-[11px] text-gray-400">{c.people ? (c.audience === "any" ? "A professional" : c.audience === "female" ? "A woman" : "A man") : "Products only (no people)"}</p>
                  {c.qc && (
                    <p className={"rounded-lg px-2 py-1 text-[11px] " + (c.qc.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                      {c.qc.ok ? "Passed the check" : "Check found: " + c.qc.issues.join("; ")}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {c.url && (
                      <button disabled={working === c.id} onClick={() => approve(c)} className="flex-1 rounded-lg bg-brand py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                        {working === c.id ? "Saving…" : "Use this"}
                      </button>
                    )}
                    <button disabled={working === c.id || c.status === "generating"} onClick={() => discard(c, true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 disabled:opacity-50">
                      Redraw
                    </button>
                    <button disabled={working === c.id || c.status === "generating"} onClick={() => discard(c, false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-600 disabled:opacity-50">
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
