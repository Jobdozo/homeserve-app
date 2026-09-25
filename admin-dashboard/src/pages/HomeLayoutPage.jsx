import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "../components/icons";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12px] font-semibold text-gray-700";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostBtnCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50";

const SECTION_TYPES = [
  { value: "categories", label: "Service category carousel" },
  { value: "services", label: "Service cards (banners can sit inside)" },
  { value: "most_booked", label: "Most booked services" },
  { value: "category", label: "Themed row (a category or keywords)" },
];
const TYPE_LABEL = Object.fromEntries(SECTION_TYPES.map((t) => [t.value, t.label]));

const PLACEMENTS = [
  { value: "hero", label: "Hero — full-width at the top" },
  { value: "inline", label: "Inline — after the Nth service card" },
  { value: "strip", label: "Strip — small chips under search" },
];
const COLORS = {
  brand: "bg-brand",
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  slate: "bg-slate-700",
};

export default function HomeLayoutPage() {
  const [tab, setTab] = useState("sections");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          ["sections", "Home sections"],
          ["banners", "Promotional banners"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold ${
              tab === id ? "bg-brand text-white" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "sections" ? <SectionsPanel /> : <BannersPanel />}
    </div>
  );
}

// ---------------------------------------------------------------- sections

function SectionsPanel() {
  const { showToast, categories } = useApp();
  const [sections, setSections] = useState(null);
  const [editing, setEditing] = useState(null); // section object, or {} for new

  const refresh = () => api.listHomeSections().then(setSections).catch(() => setSections([]));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await refresh();
    } catch (e) {
      showToast(e.message || "Something went wrong");
    }
  };

  const move = (index, dir) => {
    const ids = sections.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setSections(ids.map((id) => sections.find((s) => s.id === id)));
    run(() => api.reorderHomeSections(ids));
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Customer home sections</h2>
          <p className="text-[12px] text-gray-500">Shown top to bottom on the customer app home page. Hidden sections and sections with no matching services don't appear.</p>
        </div>
        <button className={btnCls} onClick={() => setEditing({})}>
          + Add section
        </button>
      </div>

      <div className="mt-4 divide-y divide-gray-50">
        {sections === null && <p className="py-6 text-center text-[12px] text-gray-400">Loading…</p>}
        {sections?.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex flex-col">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-[11px] text-gray-400 hover:text-gray-800 disabled:opacity-25" aria-label="Move up">
                ▲
              </button>
              <button disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="px-1 text-[11px] text-gray-400 hover:text-gray-800 disabled:opacity-25" aria-label="Move down">
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-gray-900">{s.title}</p>
              <p className="text-[11px] text-gray-400">
                {TYPE_LABEL[s.type]}
                {s.type === "category" && ` · ${s.categoryId ? categories.find((c) => c.id === s.categoryId)?.name || "category" : `keywords: ${s.match || "—"}`}`}
                {` · up to ${s.limit || 8} items`}
              </p>
            </div>
            <button
              onClick={() => run(() => api.updateHomeSection(s.id, { enabled: s.enabled === false }))}
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                s.enabled !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
              }`}
            >
              {s.enabled !== false ? "Visible" : "Hidden"}
            </button>
            <button className={ghostBtnCls} onClick={() => setEditing(s)}>
              Edit
            </button>
            <button
              className="text-gray-300 hover:text-red-500"
              aria-label="Delete section"
              onClick={() => window.confirm(`Delete the "${s.title}" section?`) && run(() => api.deleteHomeSection(s.id), "Section deleted")}
            >
              <XIcon width={15} height={15} />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <SectionModal
          section={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            run(
              () => (editing.id ? api.updateHomeSection(editing.id, data) : api.createHomeSection(data)),
              editing.id ? "Section updated" : "Section added"
            ).then(() => setEditing(null))
          }
        />
      )}
    </div>
  );
}

function SectionModal({ section, categories, onClose, onSave }) {
  const [f, setF] = useState({
    title: section.title || "",
    type: section.type || "category",
    categoryId: section.categoryId || "",
    match: section.match || "",
    limit: section.limit || 8,
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal title={section.id ? "Edit section" : "Add section"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Section title</label>
          <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Massage for Men" />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>
            {SECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {f.type === "category" && (
          <>
            <div>
              <label className={labelCls}>Show services from category</label>
              <select className={inputCls} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">— match by keywords instead —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {!f.categoryId && (
              <div>
                <label className={labelCls}>Keywords (comma separated)</label>
                <input className={inputCls} value={f.match} onChange={(e) => set("match", e.target.value)} placeholder="massage, spa" />
                <p className="mt-1 text-[11px] text-gray-400">A service appears if its name or category contains any keyword.</p>
              </div>
            )}
          </>
        )}
        <div>
          <label className={labelCls}>Maximum items</label>
          <input type="number" min={1} max={30} className={inputCls} value={f.limit} onChange={(e) => set("limit", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostBtnCls} onClick={onClose}>
            Cancel
          </button>
          <button className={btnCls} disabled={!f.title.trim()} onClick={() => onSave({ ...f, limit: Number(f.limit) || 8 })}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- banners

function BannersPanel() {
  const { showToast } = useApp();
  const [banners, setBanners] = useState(null);
  const [editing, setEditing] = useState(null);

  const refresh = () => api.listBanners().then(setBanners).catch(() => setBanners([]));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await refresh();
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return false;
    }
  };

  const placementText = (b) =>
    b.placement === "hero" ? "Hero" : b.placement === "inline" ? `After service card ${b.afterItems || 3}` : "Strip";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Promotional banners</h2>
          <p className="text-[12px] text-gray-500">
            Hero banners sit at the top of home. Inline banners appear after the chosen service card — add one with 3 and one with 5 to get a banner after the 3rd and 5th service.
          </p>
        </div>
        <button className={btnCls} onClick={() => setEditing({})}>
          + Add banner
        </button>
      </div>

      <div className="mt-4 divide-y divide-gray-50">
        {banners === null && <p className="py-6 text-center text-[12px] text-gray-400">Loading…</p>}
        {banners?.length === 0 && <p className="py-6 text-center text-[12px] text-gray-400">No banners yet.</p>}
        {banners?.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg text-white ${COLORS[b.color] || COLORS.brand}`}>
              {b.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-gray-900">{b.title}</p>
              <p className="truncate text-[11px] text-gray-400">
                {placementText(b)}
                {b.linkType && b.linkType !== "none" ? ` · links to a ${b.linkType}` : ""}
                {b.subtitle ? ` · ${b.subtitle}` : ""}
              </p>
            </div>
            <button
              onClick={() => run(() => api.updateBanner(b.id, { active: b.active === false }))}
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                b.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
              }`}
            >
              {b.active !== false ? "Active" : "Hidden"}
            </button>
            <button className={ghostBtnCls} onClick={() => setEditing(b)}>
              Edit
            </button>
            <button
              className="text-gray-300 hover:text-red-500"
              aria-label="Delete banner"
              onClick={() => window.confirm(`Delete the banner "${b.title}"?`) && run(() => api.deleteBanner(b.id), "Banner deleted")}
            >
              <XIcon width={15} height={15} />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <BannerModal
          banner={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const ok = await run(
              () => (editing.id ? api.updateBanner(editing.id, data) : api.createBanner(data)),
              editing.id ? "Banner updated" : "Banner added"
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function BannerModal({ banner, onClose, onSave }) {
  const { services, categories } = useApp();
  const [f, setF] = useState({
    title: banner.title || "",
    subtitle: banner.subtitle || "",
    icon: banner.icon || "📣",
    color: banner.color || "brand",
    placement: banner.placement || "hero",
    afterItems: banner.afterItems || 3,
    imageUrl: banner.imageUrl || "",
    linkType: banner.linkType || "none",
    linkId: banner.linkId || "",
    ctaLabel: banner.ctaLabel || "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const targets = f.linkType === "service" ? services : f.linkType === "category" ? categories : [];

  return (
    <Modal title={banner.id ? "Edit banner" : "Add banner"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-[64px_1fr] gap-2.5">
          <div>
            <label className={labelCls}>Icon</label>
            <input className={inputCls} value={f.icon} maxLength={4} onChange={(e) => set("icon", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Summer AC service — flat 20% off" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Subtitle (optional)</label>
          <input className={inputCls} value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Where it appears</label>
          <select className={inputCls} value={f.placement} onChange={(e) => set("placement", e.target.value)}>
            {PLACEMENTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {f.placement === "inline" && (
          <div>
            <label className={labelCls}>Show after service card number</label>
            <input type="number" min={1} max={50} className={inputCls} value={f.afterItems} onChange={(e) => set("afterItems", e.target.value)} />
          </div>
        )}
        {f.placement !== "strip" && (
          <>
            <div>
              <label className={labelCls}>Colour</label>
              <div className="flex gap-2">
                {Object.entries(COLORS).map(([name, cls]) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    onClick={() => set("color", name)}
                    className={`h-7 w-7 rounded-full ${cls} ${f.color === name ? "ring-2 ring-gray-900 ring-offset-2" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Background image URL (optional)</label>
              <input className={inputCls} value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Tapping opens</label>
                <select className={inputCls} value={f.linkType} onChange={(e) => setF((p) => ({ ...p, linkType: e.target.value, linkId: "" }))}>
                  <option value="none">Nothing</option>
                  <option value="service">A service</option>
                  <option value="category">A category</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Button label</label>
                <input className={inputCls} value={f.ctaLabel} maxLength={24} onChange={(e) => set("ctaLabel", e.target.value)} placeholder="Book now" />
              </div>
            </div>
            {f.linkType !== "none" && (
              <select className={inputCls} value={f.linkId} onChange={(e) => set("linkId", e.target.value)}>
                <option value="">Select…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostBtnCls} onClick={onClose}>
            Cancel
          </button>
          <button
            className={btnCls}
            disabled={!f.title.trim() || (f.linkType !== "none" && !f.linkId)}
            onClick={() => onSave({ ...f, afterItems: Number(f.afterItems) || 3 })}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
