import { useEffect, useMemo, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import { ChangeHistoryModal } from "../components/ChangeHistory";
import { CommunicationChargesProvider, ChargesCell } from "../components/CommunicationCharges";
import useSubcategories, { reloadSubcategories } from "../utils/useSubcategories";

const TABS = [
  { label: "All", status: null },
  { label: "Pending Approval", status: "pending_approval" },
  { label: "Active", status: "active" },
  { label: "Inactive", status: "inactive" },
  { label: "Rejected", status: "rejected" },
  { label: "Draft", status: "draft" },
];

const statusStyles = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-200 text-gray-600",
  draft: "bg-amber-100 text-amber-700",
  pending_approval: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-600",
};

const statusLabels = { pending_approval: "pending approval" };

// One module for both: the tiles at the top are the six headline numbers and
// jump straight to the matching list below.
export default function ServicesPage() {
  return (
    <CommunicationChargesProvider>
      <ServicesModule />
    </CommunicationChargesProvider>
  );
}

function ServicesModule() {
  const { categories, services, refreshData } = useApp();
  const [view, setView] = useState("services");
  const [pendingChanges, setPendingChanges] = useState([]);
  const loadChanges = () => api.listServiceChanges("pending").then(setPendingChanges).catch(() => {});
  useEffect(() => {
    loadChanges();
  }, []);
  const [tab, setTab] = useState("All");
  const [catFilter, setCatFilter] = useState("all");

  const count = (status) => services.filter((s) => s.status === status).length;
  const tiles = [
    { label: "Active categories", value: categories.filter((c) => c.active !== false).length, go: () => { setView("categories"); setCatFilter("active"); } },
    { label: "Inactive categories", value: categories.filter((c) => c.active === false).length, go: () => { setView("categories"); setCatFilter("inactive"); } },
    { label: "Services", value: services.length, go: () => { setView("services"); setTab("All"); } },
    { label: "Active services", value: count("active"), go: () => { setView("services"); setTab("Active"); } },
    { label: "Pending services", value: count("pending_approval"), go: () => { setView("services"); setTab("Pending Approval"); }, tone: count("pending_approval") > 0 ? "text-blue-600" : undefined },
    { label: "Rejected services", value: count("rejected"), go: () => { setView("services"); setTab("Rejected"); }, tone: count("rejected") > 0 ? "text-red-600" : undefined },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={t.go}
            className="rounded-2xl bg-white p-3.5 text-left shadow-card transition-shadow hover:shadow-md"
          >
            <p className={`text-[22px] font-extrabold ${t.tone || "text-gray-900"}`}>{t.value}</p>
            <p className="text-[11.5px] font-medium text-gray-400">{t.label}</p>
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
        {[
          ["services", "Services"],
          ["categories", "Categories"],
          ["subcategories", "Sub-categories"],
          ["catalog", "Catalog"],
          ["changes", `Change requests${pendingChanges.length ? ` (${pendingChanges.length})` : ""}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${view === key ? "bg-brand text-white" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "categories" ? (
        <CategoriesPanel filter={catFilter} setFilter={setCatFilter} />
      ) : view === "subcategories" ? (
        <SubcategoriesPanel />
      ) : view === "catalog" ? (
        <CatalogPanel />
      ) : view === "changes" ? (
        <ChangeRequestsPanel
          requests={pendingChanges}
          onReviewed={() => {
            loadChanges();
            refreshData();
          }}
        />
      ) : (
        <ServicesPanel tab={tab} setTab={setTab} />
      )}
    </div>
  );
}

function ServicesPanel({ tab, setTab }) {
  const { services, providers, toggleServiceStatus, reviewService, deleteService, showToast } = useApp();
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const allSubs = useSubcategories();
  const subName = (id) => allSubs.find((x) => x.id === id)?.name || "";
  const providerName = (id) => providers.find((p) => p.id === id)?.name || "—";
  const activeTab = TABS.find((t) => t.label === tab);
  const pendingCount = services.filter((s) => s.status === "pending_approval").length;

  const filtered = useMemo(() => {
    if (!activeTab.status) return services;
    return services.filter((s) => s.status === activeTab.status);
  }, [services, activeTab]);

  const run = async (id, fn) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      showToast(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (s) => {
    if (confirmDeleteId !== s.id) {
      setConfirmDeleteId(s.id);
      return;
    }
    setConfirmDeleteId(null);
    run(s.id, () => deleteService(s.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => setTab(t.label)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${
              tab === t.label ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.status === "pending_approval" && pendingCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Communication charge</th>
                <th className="px-4 py-3 font-medium">Moderate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pct = discountPct(s.price, s.originalPrice);
                const busy = busyId === s.id;
                return (
                  <tr key={s.id} className="border-b border-gray-50 align-top last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      <div className="flex items-center gap-2">
                        <CategoryIcon categoryId={s.categoryId} size={28} rounded="rounded-lg" /> {s.name}
                      </div>
                      {s.status === "rejected" && s.approvalNote && (
                        <p className="mt-1 text-[11px] font-normal text-red-500">Rejected: {s.approvalNote}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-500">
                      {s.categoryId?.replace(/-/g, " ")}
                      {s.subcategoryId && <span className="block text-[11px] normal-case text-gray-400">{subName(s.subcategoryId)}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{providerName(s.providerId)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900">₹{s.price}</span>
                        {pct > 0 && (
                          <>
                            <span className="text-[11px] text-gray-400 line-through">₹{s.originalPrice}</span>
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                              {pct}% OFF
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.reviewCount > 0 ? (
                        <span className="flex items-center gap-1 text-gray-700">
                          <StarIcon filled width={12} height={12} /> {s.rating} ({formatCount(s.reviewCount)})
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusStyles[s.status] || statusStyles.inactive}`}
                      >
                        {statusLabels[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChargesCell type="service" id={s.id} name={s.name} categoryId={s.categoryId} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(s.status === "pending_approval" || s.status === "rejected") && (
                          <button
                            disabled={busy}
                            onClick={() => run(s.id, () => reviewService(s.id, "approved"))}
                            className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
                          >
                            <CheckIcon width={12} height={12} /> Approve
                          </button>
                        )}
                        {s.status === "pending_approval" && (
                          <button
                            disabled={busy}
                            onClick={() => setRejecting({ service: s, note: "" })}
                            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 disabled:opacity-50"
                          >
                            <XIcon width={12} height={12} /> Reject
                          </button>
                        )}
                        {(s.status === "active" || s.status === "inactive") && (
                          <button
                            onClick={() => toggleServiceStatus(s.id, s.status)}
                            className="switch"
                            data-on={s.status === "active"}
                            aria-label={`Toggle ${s.name}`}
                          >
                            <span className="switch-knob" />
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setEditing({
                              service: s,
                              name: s.name,
                              tagline: s.tagline || "",
                              price: String(s.price),
                              originalPrice: s.originalPrice ? String(s.originalPrice) : "",
                              categoryId: s.categoryId || "",
                              subcategoryId: s.subcategoryId || "",
                              icon: s.icon || "",
                              distanceLabel: s.distanceLabel || "",
                              includesText: (s.includes || []).join("\n"),
                            })
                          }
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setHistoryFor({ type: "service", id: s.id, title: s.name })}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-500"
                        >
                          History
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => handleDelete(s)}
                          className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
                            confirmDeleteId === s.id
                              ? "bg-red-600 text-white"
                              : "border border-red-200 text-red-600"
                          }`}
                        >
                          {confirmDeleteId === s.id ? "Confirm delete" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No {tab.toLowerCase()} services.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejecting && (
        <Modal title={`Reject "${rejecting.service.name}"`} onClose={() => setRejecting(null)}>
          <p className="text-[12px] text-gray-500">The provider will see this reason and can edit the service to resubmit.</p>
          <textarea
            value={rejecting.note}
            onChange={(e) => setRejecting({ ...rejecting, note: e.target.value })}
            rows={3}
            placeholder="Reason (optional)"
            className="mt-3 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand"
          />
          <button
            onClick={() => {
              const { service, note } = rejecting;
              setRejecting(null);
              run(service.id, () => reviewService(service.id, "rejected", note.trim()));
            }}
            className="mt-3 w-full rounded-lg bg-red-600 py-2 text-[12.5px] font-semibold text-white"
          >
            Reject service
          </button>
        </Modal>
      )}

      {editing && <EditServiceModal editing={editing} onClose={() => setEditing(null)} />}
      {historyFor && (
        <ChangeHistoryModal
          entityType={historyFor.type}
          entityId={historyFor.id}
          title={historyFor.title}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

// Shrink a photo before upload (longest side 1200px, JPEG) so the customer app
// stays fast on mobile data. Formats the browser can't decode go up unchanged.
async function shrinkImage(file, maxSide = 1200) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "service.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function ServicePhotoField({ service }) {
  const { setServiceImage, showToast } = useApp();
  const [imageUrl, setImageUrl] = useState(service.imageUrl || null);
  const [busy, setBusy] = useState(false);

  const change = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file (JPEG, PNG or WebP)");
      return;
    }
    setBusy(true);
    try {
      const updated = await setServiceImage(service.id, await shrinkImage(file));
      setImageUrl(updated.imageUrl);
    } catch (err) {
      showToast(err.message || "Could not upload the photo");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const updated = await setServiceImage(service.id, null);
      setImageUrl(updated.imageUrl);
    } catch (err) {
      showToast(err.message || "Could not remove the photo");
    }
    setBusy(false);
  };

  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Service photo</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {imageUrl ? (
            <img src={`${SERVER_URL}${imageUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-gray-400">Category picture</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label className={`cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Working…" : imageUrl ? "Replace photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => { change(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {imageUrl && (
            <button onClick={remove} disabled={busy} className="text-[11.5px] font-semibold text-red-500 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-gray-400">Shown on this service in the customer app. Without one, the category picture is used.</p>
    </div>
  );
}

// The wide picture at the top of this category's page in the customer app.
function CategoryBannerField({ category }) {
  const { setCategoryBanner, showToast } = useApp();
  const [bannerUrl, setBannerUrl] = useState(category.bannerUrl || null);
  const [busy, setBusy] = useState(false);

  const change = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file (JPEG, PNG or WebP)");
      return;
    }
    setBusy(true);
    try {
      const updated = await setCategoryBanner(category.id, await shrinkImage(file, 1800));
      setBannerUrl(updated.bannerUrl);
    } catch (err) {
      showToast(err.message || "Could not upload the banner");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const updated = await setCategoryBanner(category.id, null);
      setBannerUrl(updated.bannerUrl);
    } catch (err) {
      showToast(err.message || "Could not remove the banner");
    }
    setBusy(false);
  };

  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Category banner</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {bannerUrl ? (
            <img src={`${SERVER_URL}${bannerUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-gray-400">Default picture</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label className={`cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Working…" : bannerUrl ? "Replace banner" : "Upload banner"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => { change(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {bannerUrl && (
            <button onClick={remove} disabled={busy} className="text-[11.5px] font-semibold text-red-500 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-gray-400">
        Wide picture at the top of this category's page on the website. Use a landscape photo (about 1800 × 600). Without one, the default category picture is used.
      </p>
    </div>
  );
}

function EditServiceModal({ editing, onClose }) {
  const { updateService, categories, showToast } = useApp();
  const [form, setForm] = useState(editing);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const price = Number(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
      showToast("Enter a name and a valid price");
      return;
    }
    setSaving(true);
    try {
      await updateService(editing.service.id, {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        price,
        originalPrice: form.originalPrice.trim() ? Number(form.originalPrice) : null,
        categorySlug: form.categoryId,
        subcategoryId: form.subcategoryId || null,
        icon: form.icon.trim() || null,
        distanceLabel: form.distanceLabel.trim() || null,
        includes: form.includesText
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      showToast(err.message || "Failed to update service");
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand";
  return (
    <Modal title="Edit service" onClose={onClose}>
      <div className="space-y-3">
        <ServicePhotoField service={editing.service} />
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Tagline</label>
          <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: "" })}
              className={input}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active === false ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Icon</label>
            <input value={form.icon} maxLength={8} onChange={(e) => setForm({ ...form, icon: e.target.value })} className={input} />
          </div>
        </div>
        <SubcategorySelect categoryId={form.categoryId} value={form.subcategoryId} onChange={(v) => setForm({ ...form, subcategoryId: v })} className={input} />
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Distance label</label>
          <input
            value={form.distanceLabel}
            onChange={(e) => setForm({ ...form, distanceLabel: e.target.value })}
            placeholder="e.g. 3.2 km away"
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">What's included (one per line)</label>
          <textarea
            value={form.includesText}
            onChange={(e) => setForm({ ...form, includesText: e.target.value })}
            rows={4}
            className={input + " resize-none"}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Price (₹)</label>
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Original price (₹)</label>
            <input
              type="number"
              min="0"
              value={form.originalPrice}
              onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
              className={input}
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
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

// Sub-categories: an optional level between a category and its services
// (AC Services -> Window AC / Split AC / VRF AC).
function SubcategoriesPanel() {
  const { categories, services, showToast, refreshData } = useApp();
  const subs = useSubcategories();
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // { id, name }

  const current = categoryId || categories[0]?.id || "";
  const mine = subs.filter((s) => s.categoryId === current).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const count = (id) => services.filter((s) => s.subcategoryId === id).length;
  const unsorted = services.filter((s) => s.categoryId === current && !s.subcategoryId).length;

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      await fn();
      await reloadSubcategories();
      refreshData?.();
      if (okMsg) showToast(okMsg);
    } catch (e) {
      showToast(e.message || "That didn't work");
    }
    setBusy(null);
  };

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run("new", async () => {
      await api.createSubcategory({ categoryId: current, name: name.trim() });
      setName("");
    }, "Sub-category added");
  };

  const move = (sub, dir) => {
    const i = mine.findIndex((s) => s.id === sub.id);
    const other = mine[i + dir];
    if (!other) return;
    run(sub.id, async () => {
      await api.updateSubcategory(sub.id, { sortOrder: other.sortOrder });
      await api.updateSubcategory(other.id, { sortOrder: sub.sortOrder });
    });
  };

  const input = "rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand";
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-[12px] text-gray-500">
        Split a category into types — for example AC Services into Window AC, Split AC and VRF AC. Customers then pick a type first, and providers choose
        their services by type. Categories without sub-categories work exactly as before. Assign each service to a sub-category from <strong>Services → Edit</strong> or
        in the <strong>Catalog</strong>.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-card">
        <label className="text-[12px] font-semibold text-gray-600">Category</label>
        <select value={current} onChange={(e) => setCategoryId(e.target.value)} className={input}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
              {c.active === false ? " (inactive)" : ""}
            </option>
          ))}
        </select>
        <form onSubmit={add} className="flex min-w-[240px] flex-1 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="New sub-category, e.g. Split AC" className={input + " min-w-0 flex-1"} />
          <button disabled={!name.trim() || busy === "new"} className="rounded-lg bg-brand px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">
            Add
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Sub-category</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Shown to customers</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {mine.map((s, i) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {editing?.id === s.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(s.id, () => api.updateSubcategory(s.id, { name: editing.name }), "Renamed").then(() => setEditing(null));
                        }}
                        className="flex gap-2"
                      >
                        <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value.slice(0, 40) })} className={input + " w-48"} />
                        <button className="text-[12px] font-semibold text-brand">Save</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-[12px] text-gray-400">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{count(s.id)}</td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === s.id}
                      onClick={() => run(s.id, () => api.updateSubcategory(s.id, { active: s.active === false }))}
                      className={"switch" + (s.active !== false ? " on" : "")}
                      aria-label={"Toggle " + s.name}
                    >
                      <span className="switch-knob" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex gap-3 whitespace-nowrap text-[12px] font-semibold">
                      <button disabled={i === 0 || busy === s.id} onClick={() => move(s, -1)} className="text-gray-400 disabled:opacity-30" title="Move up">
                        ↑
                      </button>
                      <button disabled={i === mine.length - 1 || busy === s.id} onClick={() => move(s, 1)} className="text-gray-400 disabled:opacity-30" title="Move down">
                        ↓
                      </button>
                      <button onClick={() => setEditing({ id: s.id, name: s.name })} className="text-brand hover:underline">
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete "' + s.name + '"? Its ' + count(s.id) + " service(s) stay in the category, without a type.")) {
                            run(s.id, () => api.deleteSubcategory(s.id), "Sub-category deleted");
                          }
                        }}
                        className="text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {mine.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No sub-categories in this category yet. Add the first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {mine.length > 0 && unsorted > 0 && (
        <p className="text-[12px] text-amber-600">
          {unsorted} service{unsorted === 1 ? " in" : "s in"} this category {unsorted === 1 ? "has" : "have"} no sub-category yet. Customers see {unsorted === 1 ? "it" : "them"} under "All" only — open
          Services → Edit to assign a type.
        </p>
      )}
    </div>
  );
}

function SubcategorySelect({ categoryId, value, onChange, className }) {
  const subs = useSubcategories().filter((s) => s.categoryId === categoryId && (s.active !== false || s.id === value));
  if (subs.length === 0) return null;
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Sub-category</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">None</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.active === false ? " (hidden)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function CategoriesPanel({ filter, setFilter }) {
  const { categories, services, addCategory, updateCategory, deleteCategory, showToast } = useApp();
  const [adding, setAdding] = useState({ name: "", icon: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const visible = categories.filter(
    (c) => filter === "all" || (filter === "active" ? c.active !== false : c.active === false)
  );
  const serviceCount = (id) => services.filter((s) => s.categoryId === id).length;

  const run = async (id, fn) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      showToast(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!adding.name.trim()) return;
    await run("new", async () => {
      await addCategory({ name: adding.name.trim(), icon: adding.icon.trim() || undefined });
      setAdding({ name: "", icon: "" });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {["all", "active", "inactive"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-semibold capitalize transition-colors ${
              filter === f ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <form onSubmit={submitAdd} className="flex gap-2 rounded-2xl bg-white p-3 shadow-card">
        <input
          value={adding.icon}
          onChange={(e) => setAdding({ ...adding, icon: e.target.value })}
          placeholder="🌿"
          maxLength={8}
          className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-[14px] outline-none focus:border-brand"
        />
        <input
          value={adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
          placeholder="New category name"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!adding.name.trim() || busyId === "new"}
          className="flex-shrink-0 rounded-lg bg-brand px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          Add category
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Communication charge</th>
                <th className="px-4 py-3 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const active = c.active !== false;
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      <span className="mr-2 text-lg">{c.icon}</span>
                      {c.name}
                      <span className="ml-2 text-[10.5px] font-normal text-gray-400">{c.id}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{serviceCount(c.id)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChargesCell type="category" id={c.id} name={c.name} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => run(c.id, () => updateCategory(c.id, { active: !active }))}
                          disabled={busy}
                          className="switch"
                          data-on={active}
                          aria-label={`Toggle ${c.name}`}
                        >
                          <span className="switch-knob" />
                        </button>
                        <button
                          onClick={() => setEditingCat({ id: c.id, name: c.name, icon: c.icon || "" })}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setHistoryFor({ type: "category", id: c.id, title: c.name })}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-500"
                        >
                          History
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (confirmDeleteId !== c.id) return setConfirmDeleteId(c.id);
                            setConfirmDeleteId(null);
                            run(c.id, () => deleteCategory(c.id));
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
                            confirmDeleteId === c.id ? "bg-red-600 text-white" : "border border-red-200 text-red-600"
                          }`}
                        >
                          {confirmDeleteId === c.id ? "Confirm delete" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No {filter === "all" ? "" : filter} categories.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="px-1 text-[11.5px] text-gray-400">
        An inactive category and all of its services are hidden from customers, and providers can't add services to
        it. A category can only be deleted once it has no services.
      </p>

      {historyFor && (
        <ChangeHistoryModal
          entityType={historyFor.type}
          entityId={historyFor.id}
          title={historyFor.title}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {editingCat && (
        <Modal title="Edit category" onClose={() => setEditingCat(null)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={editingCat.icon}
                onChange={(e) => setEditingCat({ ...editingCat, icon: e.target.value })}
                maxLength={8}
                className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-[14px] outline-none focus:border-brand"
              />
              <input
                value={editingCat.name}
                onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand"
              />
            </div>
            <CategoryBannerField key={editingCat.id} category={categories.find((c) => c.id === editingCat.id) || editingCat} />
            <button
              onClick={() => {
                const { id, name, icon } = editingCat;
                setEditingCat(null);
                run(id, () => updateCategory(id, { name, icon }));
              }}
              className="w-full rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const CHANGE_LABELS = { name: "Name", tagline: "Tagline", price: "Price (₹)", originalPrice: "Original price (₹)", distanceLabel: "Distance label" };
const showChange = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

// Provider-submitted modifications to a live service: the service keeps its
// current details until one of these is approved (as proposed, or after the
// admin edits the proposed values), or rejected.
function ChangeRequestsPanel({ requests, onReviewed }) {
  const { providers, showToast } = useApp();
  const [editing, setEditing] = useState({});
  const [rejecting, setRejecting] = useState({});
  const [busyId, setBusyId] = useState(null);

  const review = async (r, decision, note, edits) => {
    setBusyId(r.id);
    try {
      await api.reviewServiceChange(r.id, decision, note, edits);
      showToast(decision === "approved" ? "Changes approved and applied" : "Changes rejected");
      onReviewed();
    } catch (err) {
      showToast(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <p className="rounded-2xl bg-white py-14 text-center text-sm text-gray-400 shadow-card">
        No provider change requests waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const provider = providers.find((p) => p.id === r.providerId)?.name || "Provider";
        const edits = editing[r.id];
        const input = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-brand";
        return (
          <div key={r.id} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">{r.serviceName}</p>
                <p className="text-[11.5px] text-gray-400">
                  {provider} · requested{" "}
                  {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">pending</span>
            </div>

            <div className="mt-3 space-y-1.5">
              {Object.entries(r.changes).map(([field, c]) => (
                <div key={field} className="grid grid-cols-[110px_1fr] items-center gap-2 text-[12px]">
                  <span className="font-medium text-gray-500">{CHANGE_LABELS[field] || field}</span>
                  {edits ? (
                    <input
                      value={edits[field] ?? ""}
                      onChange={(e) => setEditing({ ...editing, [r.id]: { ...edits, [field]: e.target.value } })}
                      className={input}
                    />
                  ) : (
                    <span>
                      <span className="text-red-500 line-through decoration-red-300">{showChange(c.from)}</span>
                      {" → "}
                      <span className="font-semibold text-emerald-600">{showChange(c.to)}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {rejecting[r.id] !== undefined ? (
              <div className="mt-3 space-y-2">
                <input
                  value={rejecting[r.id]}
                  onChange={(e) => setRejecting({ ...rejecting, [r.id]: e.target.value })}
                  placeholder="Reason for the provider (optional)"
                  className={input}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejecting((p) => { const n = { ...p }; delete n[r.id]; return n; })}
                    className="flex-1 rounded-lg border border-gray-200 py-2 text-[12px] font-semibold text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => review(r, "rejected", rejecting[r.id].trim())}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    Reject changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busyId === r.id}
                  onClick={() => {
                    const values = edits
                      ? Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, v === "" ? null : v]))
                      : undefined;
                    review(r, "approved", undefined, values);
                  }}
                  className="rounded-lg bg-brand px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {edits ? "Approve with my edits" : "Approve"}
                </button>
                <button
                  onClick={() =>
                    setEditing((p) => {
                      if (p[r.id]) {
                        const n = { ...p };
                        delete n[r.id];
                        return n;
                      }
                      return { ...p, [r.id]: Object.fromEntries(Object.entries(r.changes).map(([k, c]) => [k, c.to ?? ""])) };
                    })
                  }
                  className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-600"
                >
                  {edits ? "Cancel edits" : "Edit"}
                </button>
                <button
                  onClick={() => setRejecting({ ...rejecting, [r.id]: "" })}
                  className="rounded-lg border border-red-200 px-3.5 py-2 text-[12px] font-semibold text-red-600"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- catalog
// Ready-made services a Super Admin curates once, then pushes onto any
// provider in one click instead of retyping name/category/price each time.

function CatalogPanel() {
  const { categories, providers, showToast } = useApp();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // {} for new, or the item for edit
  const [applying, setApplying] = useState(null); // the item being pushed to a provider
  const [busyId, setBusyId] = useState(null);

  const refresh = () => api.listServiceCatalog().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    refresh();
  }, []);

  const categoryName = (slug) => categories.find((c) => c.id === slug)?.name || slug;

  const toggleActive = async (item) => {
    setBusyId(item.id);
    try {
      await api.updateServiceCatalogItem(item.id, { active: item.active === false });
      refresh();
    } catch (e) {
      showToast(e.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}" from the catalog? Services already given to providers are not affected.`)) return;
    setBusyId(item.id);
    try {
      await api.deleteServiceCatalogItem(item.id);
      showToast("Removed from catalog");
      refresh();
    } catch (e) {
      showToast(e.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  if (items === null) return <div className="py-16 text-center text-[13px] text-gray-400">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-gray-500">
          A ready-made list of services. Pick one for any provider and it's added to their page instantly, already filled in.
        </p>
        <button onClick={() => setEditing({})} className="rounded-lg bg-brand px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-brand-dark">
          + Add to catalog
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-card">
          <p className="text-[13px] text-gray-500">No catalog items yet — add the first one above.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const pct = discountPct(item.price, item.originalPrice);
          return (
            <div key={item.id} className={`rounded-2xl bg-white p-4 shadow-card ${item.active === false ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {item.imageUrl ? (
                      <img src={`${SERVER_URL}${item.imageUrl}`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[9px] text-gray-300">No photo</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-gray-900">{item.name}</p>
                    <p className="text-[11px] text-gray-400">{categoryName(item.categorySlug)}</p>
                  </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.active === false ? "bg-gray-200 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
                  {item.active === false ? "Inactive" : "Active"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-gray-800">₹{item.price}</span>
                {pct > 0 && (
                  <>
                    <span className="text-[11px] text-gray-400 line-through">₹{item.originalPrice}</span>
                    <span className="text-[10.5px] font-semibold text-emerald-600">{pct}% off</span>
                  </>
                )}
              </div>
              {item.tagline && <p className="mt-1 text-[11.5px] text-gray-500">{item.tagline}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setApplying(item)}
                  disabled={item.active === false}
                  className="rounded-lg bg-brand px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  Add to provider →
                </button>
                <button onClick={() => setEditing(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600">
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(item)}
                  disabled={busyId === item.id}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 disabled:opacity-50"
                >
                  {item.active === false ? "Activate" : "Deactivate"}
                </button>
                <button
                  onClick={() => remove(item)}
                  disabled={busyId === item.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-[11.5px] font-semibold text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <CatalogItemModal item={editing} categories={categories} onClose={() => setEditing(null)} onSaved={refresh} onPhotoChanged={refresh} />
      )}
      {applying && <ApplyCatalogItemModal item={applying} providers={providers} onClose={() => setApplying(null)} onApplied={refresh} />}
    </div>
  );
}

function CatalogPhotoField({ item, onChanged }) {
  const { showToast } = useApp();
  const [imageUrl, setImageUrl] = useState(item.imageUrl || null);
  const [busy, setBusy] = useState(false);

  const change = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file (JPEG, PNG or WebP)");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.uploadServiceCatalogImage(item.id, await shrinkImage(file));
      setImageUrl(updated.imageUrl);
      onChanged?.();
    } catch (err) {
      showToast(err.message || "Could not upload the photo");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const updated = await api.removeServiceCatalogImage(item.id);
      setImageUrl(updated.imageUrl);
      onChanged?.();
    } catch (err) {
      showToast(err.message || "Could not remove the photo");
    }
    setBusy(false);
  };

  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Photo</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {imageUrl ? (
            <img src={`${SERVER_URL}${imageUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-gray-400">Category picture</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label className={`cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Working…" : imageUrl ? "Replace photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => { change(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {imageUrl && (
            <button onClick={remove} disabled={busy} className="text-[11.5px] font-semibold text-red-500 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-gray-400">
        Copied to each service this catalog item is added to, so editing or removing it later never affects those.
      </p>
    </div>
  );
}

function CatalogItemModal({ item, categories, onClose, onSaved, onPhotoChanged }) {
  const { showToast } = useApp();
  const isNew = !item.id;
  const [form, setForm] = useState({
    categorySlug: item.categorySlug || "",
    subcategoryId: item.subcategoryId || "",
    name: item.name || "",
    price: item.price != null ? String(item.price) : "",
    originalPrice: item.originalPrice != null ? String(item.originalPrice) : "",
    tagline: item.tagline || "",
    includesText: (item.includes || []).join("\n"),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const price = Number(form.price);
    if (!form.categorySlug) return showToast("Choose a category");
    if (!form.name.trim()) return showToast("Enter a name");
    if (!Number.isFinite(price) || price < 0) return showToast("Enter a valid price");
    setSaving(true);
    const payload = {
      categorySlug: form.categorySlug,
      subcategoryId: form.subcategoryId || null,
      name: form.name.trim(),
      price,
      originalPrice: form.originalPrice.trim() ? Number(form.originalPrice) : null,
      tagline: form.tagline.trim(),
      includes: form.includesText.split("\n").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (isNew) await api.createServiceCatalogItem(payload);
      else await api.updateServiceCatalogItem(item.id, payload);
      showToast(isNew ? "Added to catalog" : "Catalog item updated");
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.message || "Failed to save");
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand";
  return (
    <Modal title={isNew ? "Add to catalog" : "Edit catalog item"} onClose={onClose}>
      <div className="space-y-3">
        {!isNew && <CatalogPhotoField item={item} onChanged={onPhotoChanged} />}
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Category</label>
          <select value={form.categorySlug} onChange={(e) => setForm({ ...form, categorySlug: e.target.value, subcategoryId: "" })} className={input}>
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <SubcategorySelect categoryId={form.categorySlug} value={form.subcategoryId} onChange={(v) => setForm({ ...form, subcategoryId: v })} className={input} />
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. AC Gas Refill" className={input} />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Tagline (optional)</label>
          <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Price (₹)</label>
            <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Original price (₹)</label>
            <input type="number" min="0" value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} className={input} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">What's included (one per line)</label>
          <textarea
            value={form.includesText}
            onChange={(e) => setForm({ ...form, includesText: e.target.value })}
            rows={4}
            className={input + " resize-none"}
          />
        </div>
        <button onClick={save} disabled={saving} className="w-full rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function ApplyCatalogItemModal({ item, providers, onClose, onApplied }) {
  const { showToast } = useApp();
  const [providerId, setProviderId] = useState("");
  const [price, setPrice] = useState(String(item.price));
  const [saving, setSaving] = useState(false);

  const apply = async () => {
    if (!providerId) return showToast("Choose a provider");
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return showToast("Enter a valid price");
    setSaving(true);
    try {
      await api.applyServiceCatalogItem(item.id, providerId, { price: n });
      const providerName = providers.find((p) => p.id === providerId)?.name || "the provider";
      showToast(`"${item.name}" added to ${providerName}`);
      onApplied();
      onClose();
    } catch (e) {
      showToast(e.message || "Failed to add service");
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand";
  return (
    <Modal title={`Add "${item.name}" to a provider`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Provider</label>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={input}>
            <option value="">Select a provider</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Price for this provider (₹)</label>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
          <p className="mt-1 text-[10.5px] text-gray-400">Defaults to the catalog price — change it if this provider charges differently.</p>
        </div>
        <button onClick={apply} disabled={saving || !providerId} className="w-full rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">
          {saving ? "Adding…" : "Add to provider"}
        </button>
      </div>
    </Modal>
  );
}
