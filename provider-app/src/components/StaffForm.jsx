import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const inputCls = "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";

// Add / edit a staff member: identity, role, module access, services and
// areas. Changing the role loads that role's default permissions, which can
// then be adjusted freely per person.
export default function StaffForm({ staff, onClose, onSaved }) {
  const { staff: me, can, showToast } = useApp();
  const [catalogue, setCatalogue] = useState(null);
  const [f, setF] = useState({
    name: staff?.name || "",
    phone: staff?.phone || "",
    email: staff?.email || "",
    role: staff?.role || "Field Staff",
    permissions: new Set(staff?.permissions || []),
    serviceIds: new Set(staff?.serviceIds || []),
    pincodes: (staff?.pincodes || []).join(", "),
  });
  const [busy, setBusy] = useState(false);
  const editing = Boolean(staff?.id);
  const isSelf = editing && me?.id === staff.id;

  useEffect(() => {
    api
      .getStaffCatalogue()
      .then((c) => {
        setCatalogue(c);
        if (!editing) {
          const role = c.roles.find((r) => r.name === "Field Staff");
          setF((p) => ({ ...p, permissions: new Set(role?.permissions || []) }));
        }
      })
      .catch((e) => showToast(e.message || "Couldn't load staff options"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleIn = (key, id) =>
    setF((p) => {
      const next = new Set(p[key]);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...p, [key]: next };
    });
  const chooseRole = (name) => {
    const role = catalogue?.roles.find((r) => r.name === name);
    setF((p) => ({ ...p, role: name, permissions: new Set(role?.permissions || []) }));
  };
  // A staff manager can only hand out permissions they hold themselves.
  const canGrant = (perm) => !me || me.permissions.includes(perm) || (perm === "orders.view_assigned" && me.permissions.includes("orders.view_all"));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: f.name,
        phone: f.phone,
        email: f.email,
        serviceIds: [...f.serviceIds],
        pincodes: f.pincodes,
        ...(isSelf ? {} : { role: f.role, permissions: [...f.permissions] }),
      };
      const saved = editing ? await api.updateStaff(staff.id, body) : await api.createStaff(body);
      showToast(editing ? "Staff member updated" : "Staff member added");
      onSaved(saved);
    } catch (e) {
      showToast(e.message || "Couldn't save");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <h2 className="text-[16px] font-bold text-gray-900">{editing ? "Edit staff member" : "Add staff member"}</h2>
        {!catalogue ? (
          <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelCls}>Full name</label>
              <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Mobile (their login)</label>
                <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91…" />
              </div>
              <div>
                <label className={labelCls}>Email (optional)</label>
                <input className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>

            {!isSelf && (
              <>
                <div>
                  <label className={labelCls}>Role</label>
                  <select className={inputCls} value={f.role} onChange={(e) => chooseRole(e.target.value)}>
                    {catalogue.roles.map((r) => (
                      <option key={r.name}>{r.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-400">Picking a role fills in its usual access below — you can change any of it for this person.</p>
                </div>

                <div>
                  <label className={labelCls}>What they can access</label>
                  <div className="space-y-2.5 rounded-2xl border border-gray-100 p-3">
                    {catalogue.groups.map((g) => (
                      <div key={g.key}>
                        <p className="text-[12px] font-bold text-gray-800">{g.label}</p>
                        {g.permissions.map((p) => {
                          const allowed = canGrant(p.key);
                          return (
                            <label key={p.key} className={`mt-1 flex items-start gap-2 text-[12.5px] ${allowed ? "text-gray-600" : "text-gray-300"}`}>
                              <input type="checkbox" className="mt-0.5" disabled={!allowed} checked={f.permissions.has(p.key)} onChange={() => toggleIn("permissions", p.key)} />
                              {p.label}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className={labelCls}>Services they handle</label>
              {catalogue.services.length === 0 ? (
                <p className="text-[12px] text-gray-400">Add services first, then assign them here.</p>
              ) : (
                <div className="space-y-1 rounded-2xl border border-gray-100 p-3">
                  {catalogue.services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-[12.5px] text-gray-600">
                      <input type="checkbox" checked={f.serviceIds.has(s.id)} onChange={() => toggleIn("serviceIds", s.id)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-gray-400">Leave all unticked if they can take any service.</p>
            </div>

            <div>
              <label className={labelCls}>Areas (PIN codes)</label>
              <input className={inputCls} value={f.pincodes} onChange={(e) => set("pincodes", e.target.value)} placeholder="560001, 560002" inputMode="numeric" />
              <p className="mt-1 text-[11px] text-gray-400">Separate with commas. Leave blank if they can work in any area.</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">
                Cancel
              </button>
              <button onClick={save} disabled={busy || !f.name.trim() || !f.phone.trim() || (editing && !can("staff.manage"))} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
