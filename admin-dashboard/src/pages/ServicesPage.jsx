import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import { ChangeHistoryModal } from "../components/ChangeHistory";
import { CommunicationChargesProvider, ChargesCell } from "../components/CommunicationCharges";

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

      <div className="flex w-fit gap-1 rounded-xl bg-white p-1 shadow-card">
        {[
          ["services", "Services"],
          ["categories", "Categories"],
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
                    <td className="px-4 py-3 capitalize text-gray-500">{s.categoryId?.replace(/-/g, " ")}</td>
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
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
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
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
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
