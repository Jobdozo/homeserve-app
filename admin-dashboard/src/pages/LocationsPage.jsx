import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { ChevronRightIcon, XIcon } from "../components/icons";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12px] font-semibold text-gray-700";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostBtnCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50";

// A small on/off pill — flipping it saves immediately, no separate "Save" step.
function ActiveToggle({ active, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${active ? "bg-emerald-500" : "bg-gray-300"}`}
      aria-label={active ? "Active — tap to deactivate" : "Inactive — tap to activate"}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NameModal({ title, initialName = "", onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return setError("Name is required");
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim());
      onClose();
    } catch (e) {
      setError(e.message || "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className={inputCls}
          />
          {error && <p className="mt-1 text-[11.5px] text-red-500">{error}</p>}
        </div>
        <button onClick={save} disabled={saving} className={`${btnCls} w-full`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function PincodeModal({ onSave, onClose }) {
  const [pincode, setPincode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) return setError("Enter a valid 6-digit PIN code");
    setSaving(true);
    setError("");
    try {
      await onSave(pincode.trim());
      onClose();
    } catch (e) {
      setError(e.message || "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <Modal title="Add PIN code" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>PIN code</label>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="e.g. 400058"
            className={inputCls}
          />
          {error && <p className="mt-1 text-[11.5px] text-red-500">{error}</p>}
        </div>
        <button onClick={save} disabled={saving} className={`${btnCls} w-full`}>
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </Modal>
  );
}

function PincodeChip({ pincode, canEdit, onToggle, onDelete }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
        pincode.active !== false ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"
      }`}
    >
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onToggle(pincode.active === false)}
        title={pincode.active !== false ? "Tap to deactivate" : "Tap to activate"}
        className="disabled:cursor-default"
      >
        {pincode.pincode}
      </button>
      {canEdit && (
        <button type="button" onClick={onDelete} className="text-gray-400 hover:text-red-500" title="Remove PIN code">
          <XIcon width={11} height={11} />
        </button>
      )}
    </span>
  );
}

function AreaRow({ area, canEdit, onUpdate, onDelete, onAddPincode, onTogglePincode, onDeletePincode }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingPincode, setAddingPincode] = useState(false);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2 text-left">
          <ChevronRightIcon width={13} height={13} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-[12.5px] font-semibold text-gray-800">{area.name}</span>
          <span className="text-[11px] text-gray-400">
            {area.pincodes.length} PIN{area.pincodes.length === 1 ? "" : "s"}
          </span>
        </button>
        {canEdit && (
          <>
            <button onClick={() => setRenaming(true)} className="text-[11px] font-semibold text-gray-500 hover:text-brand">
              Rename
            </button>
            <button onClick={onDelete} className="text-[11px] font-semibold text-red-400 hover:text-red-600">
              Delete
            </button>
          </>
        )}
        <ActiveToggle active={area.active !== false} disabled={!canEdit} onChange={(v) => onUpdate({ active: v })} />
      </div>
      {open && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {area.pincodes.map((p) => (
              <PincodeChip
                key={p.id}
                pincode={p}
                canEdit={canEdit}
                onToggle={(active) => onTogglePincode(p.id, active)}
                onDelete={() => onDeletePincode(p.id)}
              />
            ))}
            {area.pincodes.length === 0 && <span className="text-[11.5px] text-gray-400">No PIN codes yet</span>}
            {canEdit && (
              <button
                onClick={() => setAddingPincode(true)}
                className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11.5px] font-semibold text-gray-500 hover:border-brand hover:text-brand"
              >
                + PIN code
              </button>
            )}
          </div>
        </div>
      )}
      {renaming && (
        <NameModal title="Rename area" initialName={area.name} onSave={(name) => onUpdate({ name })} onClose={() => setRenaming(false)} />
      )}
      {addingPincode && <PincodeModal onSave={onAddPincode} onClose={() => setAddingPincode(false)} />}
    </div>
  );
}

function CityCard({ city, canEdit, onUpdate, onDelete, onAddArea, onUpdateArea, onDeleteArea, onAddPincode, onTogglePincode, onDeletePincode }) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [addingArea, setAddingArea] = useState(false);

  const pinCount = city.areas.reduce((n, a) => n + a.pincodes.length, 0);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2 text-left">
          <ChevronRightIcon width={14} height={14} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-[13.5px] font-bold text-gray-900">{city.name}</span>
          <span className="text-[11px] text-gray-400">
            {city.areas.length} area{city.areas.length === 1 ? "" : "s"} · {pinCount} PIN{pinCount === 1 ? "" : "s"}
          </span>
        </button>
        {canEdit && (
          <>
            <button onClick={() => setRenaming(true)} className="text-[11.5px] font-semibold text-gray-500 hover:text-brand">
              Rename
            </button>
            <button onClick={onDelete} className="text-[11.5px] font-semibold text-red-400 hover:text-red-600">
              Delete
            </button>
          </>
        )}
        <ActiveToggle active={city.active !== false} disabled={!canEdit} onChange={(v) => onUpdate({ active: v })} />
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {city.areas.map((area) => (
            <AreaRow
              key={area.id}
              area={area}
              canEdit={canEdit}
              onUpdate={(patch) => onUpdateArea(area.id, patch)}
              onDelete={() => onDeleteArea(area.id, area.name)}
              onAddPincode={(pincode) => onAddPincode(area.id, pincode)}
              onTogglePincode={onTogglePincode}
              onDeletePincode={onDeletePincode}
            />
          ))}
          {city.areas.length === 0 && <p className="text-[11.5px] text-gray-400">No areas yet</p>}
          {canEdit && (
            <button onClick={() => setAddingArea(true)} className={`${ghostBtnCls} mt-1`}>
              + Add area
            </button>
          )}
        </div>
      )}

      {renaming && <NameModal title="Rename city" initialName={city.name} onSave={(name) => onUpdate({ name })} onClose={() => setRenaming(false)} />}
      {addingArea && <NameModal title={`Add area in ${city.name}`} onSave={onAddArea} onClose={() => setAddingArea(false)} />}
    </div>
  );
}

export default function LocationsPage() {
  const { showToast, can } = useApp();
  const canEdit = can("locations.edit") || can("locations.add") || can("locations.manage");
  const [cities, setCities] = useState(null);
  const [addingCity, setAddingCity] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = () => api.listLocations().then(setCities).catch(() => setCities([]));
  useEffect(() => {
    refresh();
  }, []);

  if (cities === null) {
    return <div className="flex justify-center py-20 text-[13px] text-gray-400">Loading…</div>;
  }

  const filtered = query.trim()
    ? cities.filter((c) => {
        const q = query.trim().toLowerCase();
        return c.name.toLowerCase().includes(q) || c.areas.some((a) => a.name.toLowerCase().includes(q) || a.pincodes.some((p) => p.pincode.includes(q)));
      })
    : cities;

  const withToast = (promise, okMessage) =>
    promise
      .then((res) => {
        if (okMessage) showToast(okMessage);
        refresh();
        return res;
      })
      .catch((e) => {
        showToast(e.message || "Something went wrong");
        throw e;
      });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Locations</h1>
          <p className="text-[12px] text-gray-500">Cities, areas and PIN codes Tikdum serves. Turn any of them off without deleting it.</p>
        </div>
        {canEdit && (
          <button onClick={() => setAddingCity(true)} className={btnCls}>
            + Add city
          </button>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a city, area or PIN code…"
        className={`${inputCls} max-w-sm`}
      />

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-card">
          <p className="text-[13px] text-gray-500">{cities.length === 0 ? "No cities added yet." : "No match for that search."}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((city) => (
          <CityCard
            key={city.id}
            city={city}
            canEdit={canEdit}
            onUpdate={(patch) => withToast(api.updateCity(city.id, patch), patch.name ? "City renamed" : undefined)}
            onDelete={() => {
              if (!confirm(`Delete "${city.name}"? Its areas and PIN codes will be removed too.`)) return;
              withToast(api.deleteCity(city.id), "City deleted");
            }}
            onAddArea={(name) => withToast(api.createArea({ cityId: city.id, name }), "Area added")}
            onUpdateArea={(areaId, patch) => withToast(api.updateArea(areaId, patch), patch.name ? "Area renamed" : undefined)}
            onDeleteArea={(areaId, name) => {
              if (!confirm(`Delete "${name}"? Its PIN codes will be removed too.`)) return;
              withToast(api.deleteArea(areaId), "Area deleted");
            }}
            onAddPincode={(areaId, pincode) => withToast(api.createPincode({ areaId, pincode }), "PIN code added")}
            onTogglePincode={(pincodeId, active) => withToast(api.updatePincode(pincodeId, { active }))}
            onDeletePincode={(pincodeId) => withToast(api.deletePincode(pincodeId), "PIN code removed")}
          />
        ))}
      </div>

      {addingCity && <NameModal title="Add city" onSave={(name) => api.createCity({ name }).then(() => { showToast("City added"); refresh(); })} onClose={() => setAddingCity(false)} />}
    </div>
  );
}
