import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "../components/icons";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";

const ACTION_LABEL = {
  view: "View",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  export: "Export",
  import: "Import",
  manage: "Manage",
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never");

export default function UserManagementPage() {
  const { can } = useApp();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState(null);
  const [catalogue, setCatalogue] = useState(null);

  const load = () => {
    api.listUsers().then(setUsers).catch(() => setUsers([]));
    api.listRoles().then(setRoles).catch(() => setRoles([]));
  };
  useEffect(() => {
    load();
    api.getPermissionCatalogue().then(setCatalogue).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl bg-white p-1 shadow-card">
        {[
          ["users", "Staff accounts"],
          ["roles", "Roles & permissions"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${tab === key ? "bg-brand text-white" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "users" ? (
        <UsersPanel users={users} roles={roles || []} reload={load} canAdd={can("users.add")} canEdit={can("users.edit")} canDelete={can("users.delete")} />
      ) : (
        <RolesPanel roles={roles} catalogue={catalogue} reload={load} canAdd={can("users.add")} canEdit={can("users.edit")} canDelete={can("users.delete")} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- users

function UsersPanel({ users, roles, reload, canAdd, canEdit, canDelete }) {
  const { showToast, admin } = useApp();
  const [editing, setEditing] = useState(null); // {} for new
  const [confirmId, setConfirmId] = useState(null);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) showToast(ok);
      reload();
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return false;
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Staff accounts {users ? `(${users.length})` : ""}</h2>
          <p className="text-[12px] text-gray-500">Staff sign in to this portal with their mobile number (WhatsApp OTP), same as you. What they can see and do depends on their role.</p>
        </div>
        {canAdd && (
          <button className={btnCls} onClick={() => setEditing({})}>
            + Add staff member
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Mobile</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Last login</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const self = u.id === admin?.id;
              return (
                <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">
                      {u.name} {self && <span className="text-[10.5px] font-normal text-gray-400">(you)</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">{u.owner ? "Set in server configuration" : u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10.5px] font-semibold text-violet-700">{u.roleName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${u.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                      {u.active !== false ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-gray-500">{u.owner ? "—" : fmt(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    {!u.owner && (
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (
                          <>
                            <button className={ghostCls} onClick={() => setEditing(u)}>
                              Edit
                            </button>
                            {!self && (
                              <button className={ghostCls} onClick={() => run(() => api.updateUser(u.id, { active: u.active === false }), u.active === false ? "Account activated" : "Account deactivated")}>
                                {u.active === false ? "Activate" : "Deactivate"}
                              </button>
                            )}
                          </>
                        )}
                        {canDelete && !self && (
                          <button
                            className={`rounded-xl px-3 py-2 text-[12.5px] font-semibold ${confirmId === u.id ? "bg-red-600 text-white" : "border border-red-200 text-red-600"}`}
                            onClick={() => {
                              if (confirmId !== u.id) return setConfirmId(u.id);
                              setConfirmId(null);
                              run(() => api.deleteUser(u.id), "Account deleted");
                            }}
                          >
                            {confirmId === u.id ? "Confirm delete" : "Delete"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!users && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserModal
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            run(() => (editing.id ? api.updateUser(editing.id, data) : api.createUser(data)), editing.id ? "Account updated" : "Staff member added").then((ok) => ok && setEditing(null))
          }
        />
      )}
    </div>
  );
}

function UserModal({ user, roles, onClose, onSave }) {
  const [f, setF] = useState({ name: user.name || "", phone: user.phone || "", email: user.email || "", roleId: user.roleId || "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const role = roles.find((r) => r.id === f.roleId);
  return (
    <Modal title={user.id ? "Edit staff member" : "Add staff member"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Full name</label>
          <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Mobile (login)</label>
            <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <label className={labelCls}>Email (optional)</label>
            <input className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Role</label>
          <select className={inputCls} value={f.roleId} onChange={(e) => set("roleId", e.target.value)}>
            <option value="">Choose a role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {role && <p className="mt-1 text-[11.5px] text-gray-400">{role.description}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostCls} onClick={onClose}>
            Cancel
          </button>
          <button className={btnCls} disabled={!f.name.trim() || !f.phone.trim() || !f.roleId} onClick={() => onSave(f)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- roles

function RolesPanel({ roles, catalogue, reload, canAdd, canEdit, canDelete }) {
  const { showToast } = useApp();
  const [editing, setEditing] = useState(null); // role object, or {} for new

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) showToast(ok);
      reload();
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return false;
    }
  };

  const summarize = (r) => {
    if (r.permissions.includes("*")) return "Full access";
    const managed = r.permissions.filter((p) => p.endsWith(".manage")).length;
    return `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}${managed ? ` · ${managed} module${managed === 1 ? "" : "s"} fully managed` : ""}`;
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Roles {roles ? `(${roles.length})` : ""}</h2>
          <p className="text-[12px] text-gray-500">Each role is a set of permissions per module. Built-in roles can be adjusted; add your own for anything else.</p>
        </div>
        {canAdd && (
          <button className={btnCls} onClick={() => setEditing({})}>
            + Create custom role
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {roles?.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-gray-900">
                {r.name}{" "}
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.system ? "bg-gray-100 text-gray-500" : "bg-violet-100 text-violet-700"}`}>
                  {r.system ? "Built-in" : "Custom"}
                </span>
              </p>
              <p className="text-[11.5px] text-gray-500">{r.description}</p>
              <p className="text-[11px] text-gray-400">
                {summarize(r)} · {r.userCount} staff
              </p>
            </div>
            <button className={ghostCls} onClick={() => setEditing(r)}>
              {r.locked || !canEdit ? "View permissions" : "Edit permissions"}
            </button>
            {!r.system && canDelete && (
              <button className="text-gray-300 hover:text-red-500" aria-label="Delete role" onClick={() => window.confirm(`Delete the "${r.name}" role?`) && run(() => api.deleteRole(r.id), "Role deleted")}>
                <XIcon width={15} height={15} />
              </button>
            )}
          </div>
        ))}
        {!roles && <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">Loading…</p>}
      </div>
      {editing && catalogue && (
        <RoleModal
          role={editing}
          roles={roles}
          catalogue={catalogue}
          readOnly={Boolean(editing.locked) || (editing.id ? !canEdit : !canAdd)}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            run(() => (editing.id ? api.updateRole(editing.id, data) : api.createRole(data)), editing.id ? "Role updated" : "Role created").then((ok) => ok && setEditing(null))
          }
        />
      )}
    </div>
  );
}

function RoleModal({ role, roles, catalogue, readOnly, onClose, onSave }) {
  const [name, setName] = useState(role.name || "");
  const [description, setDescription] = useState(role.description || "");
  const [perms, setPerms] = useState(new Set(role.permissions || []));
  const full = perms.has("*");

  const toggle = (perm) =>
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(perm) ? next.delete(perm) : next.add(perm);
      return next;
    });
  // A whole row: every action on, or none.
  const toggleRow = (mod) =>
    setPerms((prev) => {
      const next = new Set(prev);
      const keys = mod.actions.map((a) => `${mod.key}.${a}`);
      const allOn = keys.every((k) => next.has(k) || next.has(`${mod.key}.manage`));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  const applyTemplate = (id) => {
    const src = roles.find((r) => r.id === id);
    if (src && !src.locked) setPerms(new Set(src.permissions));
  };

  const count = useMemo(() => (full ? "Full access" : `${perms.size} selected`), [perms, full]);

  return (
    <Modal title={role.id ? (readOnly ? role.name : `Edit role — ${role.name}`) : "Create custom role"} onClose={onClose} wide>
      <div className="space-y-4">
        {!readOnly && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Role name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Manager" />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" />
            </div>
            {!role.id && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Start from an existing role (optional)</label>
                <select className={inputCls} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">Blank</option>
                  {roles
                    .filter((r) => !r.locked)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}
        {readOnly && role.locked && <p className="rounded-xl bg-violet-50 px-3 py-2 text-[12.5px] text-violet-800">Super Admin always has full access to every module, including user management, and can't be changed.</p>}

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[720px] text-center text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2 text-left font-medium">Module</th>
                {catalogue.actions.map((a) => (
                  <th key={a} className="px-2 py-2 font-medium">
                    {ACTION_LABEL[a]}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {catalogue.modules.map((m) => {
                const managed = full || perms.has(`${m.key}.manage`);
                return (
                  <tr key={m.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-left font-medium text-gray-700">{m.label}</td>
                    {catalogue.actions.map((a) => {
                      if (!m.actions.includes(a)) return <td key={a} className="px-2 py-2 text-gray-200">–</td>;
                      const perm = `${m.key}.${a}`;
                      const checked = managed || perms.has(perm);
                      return (
                        <td key={a} className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={readOnly || (managed && a !== "manage")}
                            onChange={() => toggle(perm)}
                            className={a === "manage" ? "accent-violet-600" : ""}
                            aria-label={`${m.label}: ${ACTION_LABEL[a]}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      {!readOnly && (
                        <button onClick={() => toggleRow(m)} className="text-[10.5px] font-semibold text-brand underline">
                          all
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-gray-400">
          <b>Manage</b> gives full control of a module (e.g. “Manage payments”, “Manage complaints”, “Manage providers”, “Manage customers”) and includes every other action in that row.
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-gray-500">{count}</span>
          <div className="flex gap-2">
            <button className={ghostCls} onClick={onClose}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button className={btnCls} disabled={!name.trim()} onClick={() => onSave({ name, description, permissions: [...perms] })}>
                Save role
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, wide, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-4xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
