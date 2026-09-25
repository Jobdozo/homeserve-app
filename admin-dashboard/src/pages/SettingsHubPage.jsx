import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { GeneralSettings } from "./SettingsPage";
import VisibilityCard from "../components/VisibilityCard";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";

const TABS = [
  ["general", "Fees, limits & referral"],
  ["visibility", "Visibility & coverage"],
  ["requests", "Requests & swaps"],
  ["ads", "Advertising"],
  ["services", "Service approval"],
  ["comms", "Communication"],
  ["staff", "Staff & permissions"],
  ["complaints", "Complaints"],
];

export default function SettingsHubPage() {
  const { showToast } = useApp();
  const [tab, setTab] = useState("general");
  const [data, setData] = useState(null);

  const load = useCallback(() => api.getBusinessRules().then(setData).catch((e) => showToast(e.message || "Couldn't load business rules")), [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch, okMsg = "Saved") => {
    try {
      await api.updateSettings(patch);
      showToast(okMsg);
      await load();
      return true;
    } catch (e) {
      showToast(e.message || "Couldn't save");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-bold text-gray-900">Business rules</h2>
        <p className="mt-0.5 text-[12px] text-gray-500">
          Change how the platform behaves without a new app release. Changes apply immediately and every change is recorded in Audit Logs → Admin changes.
        </p>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${tab === key ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "general" ? (
        <GeneralSettings />
      ) : !data ? (
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      ) : tab === "visibility" ? (
        <VisibilityTab data={data} save={save} reload={load} />
      ) : tab === "requests" ? (
        <RequestsTab data={data} save={save} />
      ) : tab === "ads" ? (
        <AdsTab data={data} save={save} />
      ) : tab === "services" ? (
        <ServicesTab data={data} save={save} />
      ) : tab === "comms" ? (
        <CommsTab data={data} save={save} />
      ) : tab === "staff" ? (
        <StaffTab data={data} save={save} />
      ) : (
        <ComplaintsTab data={data} save={save} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- building blocks

// A card that edits a group of settings: shows Save only when something changed.
function useDraft(settings, keys) {
  const pick = useCallback(() => Object.fromEntries(keys.map((k) => [k, settings[k]])), [settings, keys]);
  const [draft, setDraft] = useState(pick);
  useEffect(() => setDraft(pick()), [pick]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const changed = useMemo(() => Object.fromEntries(keys.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(settings[k])).map((k) => [k, draft[k]])), [draft, settings, keys]);
  return { draft, set, changed, dirty: Object.keys(changed).length > 0, reset: () => setDraft(pick()) };
}

function Card({ title, desc, children, form, save, disabled }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-2xl rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
      {desc && <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{desc}</p>}
      <div className="mt-4 space-y-3.5">{children}</div>
      <div className="mt-4 flex gap-2">
        <button
          disabled={!form.dirty || busy || disabled}
          onClick={async () => {
            setBusy(true);
            await save(form.changed);
            setBusy(false);
          }}
          className="rounded-xl bg-brand px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {form.dirty && (
          <button onClick={form.reset} className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600">
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, tag }) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" className="mt-1" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="text-[13px] font-semibold text-gray-800">
          {label}
          {tag && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tag === "Safety rule" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{tag}</span>}
        </span>
        {hint && <span className="block text-[11.5px] leading-snug text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

function Num({ label, hint, value, onChange, min = 0, max }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" min={min} max={max} className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {hint && <p className="mt-1 text-[11.5px] text-gray-400">{hint}</p>}
    </div>
  );
}

function Checks({ options, value, onChange, cols = 3 }) {
  const set = new Set(value || []);
  return (
    <div className={`grid gap-1.5 ${cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
      {options.map((o) => (
        <label key={o.value ?? o} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-[12.5px] text-gray-700">
          <input
            type="checkbox"
            checked={set.has(o.value ?? o)}
            onChange={() => {
              const next = new Set(set);
              next.has(o.value ?? o) ? next.delete(o.value ?? o) : next.add(o.value ?? o);
              onChange([...next]);
            }}
          />
          {o.label ?? o}
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- visibility & coverage

const VIS_RULES = [
  ["pincode", "Customer PIN inside the provider's area", "Hide a provider from customers whose PIN code isn't in their service area.", "Soft rule"],
  ["approval", "Provider must be approved", "Only approved providers are shown.", "Safety rule"],
  ["verification", "Provider must be verified", "Only verified providers are shown.", "Safety rule"],
  ["wallet", "Account must be active (wallet funded)", "Providers with an empty wallet are paused.", "Safety rule"],
  ["requestsSwitch", "Respect the provider's Receive Requests switch", "Hide providers who switched requests off.", "Safety rule"],
  ["openLimit", "Apply the maximum open request limit", "Hide providers who have too many open requests.", "Soft rule"],
  ["stale", "Apply the request age limit", "Hide providers with requests open longer than the allowed days.", "Soft rule"],
];

function VisibilityTab({ data, save, reload }) {
  const { showToast } = useApp();
  const s = data.settings;
  const keys = useMemo(() => ["visibilityRules", "pinRequireCoverage", "pinMaxPerProvider", "visibilityOverrideDefaultHours"], []);
  const form = useDraft(s, keys);
  const rules = form.draft.visibilityRules || {};
  const [busyId, setBusyId] = useState(null);

  const removeOverride = async (o) => {
    setBusyId(o.providerId);
    try {
      await api.setVisibilityOverride(o.providerId, { mode: null });
      showToast("Override removed");
      await reload();
    } catch (e) {
      showToast(e.message || "Couldn't remove");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Which rules decide provider visibility"
        desc="Switch individual rules on or off. Safety rules protect customers — turn them off only if you're sure. Service approval and active category checks always apply."
        form={form}
        save={save}
      >
        {VIS_RULES.map(([key, label, hint, tag]) => (
          <Toggle key={key} label={label} hint={hint} tag={tag} checked={rules[key] !== false} onChange={(v) => form.set("visibilityRules", { ...rules, [key]: v })} />
        ))}
      </Card>

      <Card title="PIN-code coverage" desc="How provider service areas work. Each provider's own PIN codes are edited on their profile in Providers." form={form} save={save}>
        <Toggle
          label="Providers must set a service area to be shown"
          hint="Off: a provider with no PIN codes is shown everywhere. On: they need PIN codes (or “serve all areas”, which only you can grant)."
          checked={form.draft.pinRequireCoverage}
          onChange={(v) => form.set("pinRequireCoverage", v)}
        />
        <Num label="Maximum PIN codes per provider" value={form.draft.pinMaxPerProvider} min={1} max={500} onChange={(v) => form.set("pinMaxPerProvider", v)} />
      </Card>

      <VisibilityCard />

      <Card title="Super Admin visibility override" desc="A provider's profile has “Always show / Always hide”. Set how long an override lasts by default." form={form} save={save}>
        <Num label="Default override length (hours)" hint="0 = until removed. Used as the starting value when you set an override." value={form.draft.visibilityOverrideDefaultHours} min={0} max={8760} onChange={(v) => form.set("visibilityOverrideDefaultHours", v)} />
        <div>
          <p className={labelCls}>Overrides in effect now</p>
          {data.overrides.length === 0 ? (
            <p className="text-[12px] text-gray-400">None.</p>
          ) : (
            <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
              {data.overrides.map((o) => (
                <div key={o.providerId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-gray-800">{o.providerName}</p>
                    <p className="text-[11.5px] text-gray-400">
                      Always {o.mode}
                      {o.until ? ` until ${new Date(o.until).toLocaleString("en-IN")}` : " (no end)"}
                      {o.note ? ` — ${o.note}` : ""}
                    </p>
                  </div>
                  <button disabled={busyId === o.providerId} onClick={() => removeOverride(o)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 disabled:opacity-50">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ requests & swaps

function RequestsTab({ data, save }) {
  const s = data.settings;
  const keys = useMemo(() => ["ringTimeoutSeconds", "swapEnabled", "swapMaxPerOrder", "swapReasons"], []);
  const form = useDraft(s, keys);
  const reasons = form.draft.swapReasons || [];
  const custom = reasons.filter((r) => r.key !== "other");
  const setCustom = (list) => form.set("swapReasons", [...list, ...reasons.filter((r) => r.key === "other")]);

  return (
    <div className="space-y-4">
      <Card title="Incoming requests" desc="Maximum open requests and the request age limit are under “Fees, limits & referral”." form={form} save={save}>
        <Num label="Time a provider has to accept a request (seconds)" hint="After this, the request is offered to the next provider." value={form.draft.ringTimeoutSeconds} min={15} max={600} onChange={(v) => form.set("ringTimeoutSeconds", v)} />
      </Card>
      <Card title="Order swap rules" desc="Lets a provider hand an accepted order to another provider." form={form} save={save}>
        <Toggle label="Allow providers to swap orders" checked={form.draft.swapEnabled} onChange={(v) => form.set("swapEnabled", v)} />
        <Num label="Maximum swaps per order" hint="After this many, the order can't be swapped again." value={form.draft.swapMaxPerOrder} min={1} max={10} onChange={(v) => form.set("swapMaxPerOrder", v)} />
        <div>
          <p className={labelCls}>Reasons the provider can choose</p>
          <div className="space-y-2">
            {custom.map((r, i) => (
              <div key={r.key + i} className="flex gap-2">
                <input className={inputCls} value={r.label} maxLength={80} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <button className="px-2 text-gray-300 hover:text-red-500" aria-label="Remove reason" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <p className="text-[11.5px] text-gray-400">“Other” (with a required note) is always offered last.</p>
            <button className="text-[12.5px] font-semibold text-brand underline" onClick={() => setCustom([...custom, { key: `new_${Date.now()}`, label: "" }])}>
              + Add reason
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------- advertising

function AdsTab({ data, save }) {
  const keys = useMemo(() => ["adsEnabled", "adsMaxActivePerProvider", "adsMinBalance"], []);
  const form = useDraft(data.settings, keys);
  return (
    <Card title="Advertisement rules" desc="Provider CPC ads. The rate per click is under “Fees, limits & referral”; banner ads are under Home Layout." form={form} save={save}>
      <Toggle label="Allow providers to start new ads" hint="Running ads keep working when this is off." checked={form.draft.adsEnabled} onChange={(v) => form.set("adsEnabled", v)} />
      <Num label="Maximum ads a provider can run at once" hint="0 = no limit." value={form.draft.adsMaxActivePerProvider} min={0} max={100} onChange={(v) => form.set("adsMaxActivePerProvider", v)} />
      <Num label="Minimum wallet balance to start an ad (₹)" hint="0 = no minimum." value={form.draft.adsMinBalance} min={0} onChange={(v) => form.set("adsMinBalance", v)} />
    </Card>
  );
}

// -------------------------------------------------------------------- service approval

const FIELD_LABEL = { name: "Name", tagline: "Tagline", price: "Price", originalPrice: "Original price", distanceLabel: "Distance label" };

function ServicesTab({ data, save }) {
  const keys = useMemo(() => ["serviceApprovalRequired", "serviceChangeApprovalRequired", "serviceChangeFields"], []);
  const form = useDraft(data.settings, keys);
  return (
    <Card title="Service approval rules" desc="What needs your approval before customers see it." form={form} save={save}>
      <Toggle
        label="New services need approval"
        hint="On: a provider's new service is hidden until you approve it. Off: it goes live immediately."
        checked={form.draft.serviceApprovalRequired}
        onChange={(v) => form.set("serviceApprovalRequired", v)}
      />
      <Toggle
        label="Changes to live services need approval"
        hint="On: edits to the fields below wait for your review while the old details stay live."
        checked={form.draft.serviceChangeApprovalRequired}
        onChange={(v) => form.set("serviceChangeApprovalRequired", v)}
      />
      {form.draft.serviceChangeApprovalRequired && (
        <div>
          <p className={labelCls}>Fields that need approval when changed</p>
          <Checks options={data.options.serviceChangeFields.map((f) => ({ value: f, label: FIELD_LABEL[f] || f }))} value={form.draft.serviceChangeFields} onChange={(v) => form.set("serviceChangeFields", v)} />
          <p className="mt-1 text-[11.5px] text-gray-400">Other fields are applied directly.</p>
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------- communication

function CommsTab({ data, save }) {
  const keys = useMemo(() => ["commsChatEnabled", "commsChatStatuses", "commsCallEnabled", "commsCallStatuses", "commsAfterCompletionHours"], []);
  const form = useDraft(data.settings, keys);
  const statuses = data.options.bookingStatuses;
  return (
    <Card
      title="Customer communication rules"
      desc="When customers and providers can chat or call. Enforced by the server. The customer and provider apps only show their chat and call buttons for Accepted and In Progress orders, so adding other statuses takes effect there after the next app update."
      form={form}
      save={save}
    >
      <Toggle label="Allow chat between customer and provider" checked={form.draft.commsChatEnabled} onChange={(v) => form.set("commsChatEnabled", v)} />
      <div>
        <p className={labelCls}>Chat is open while the order is…</p>
        <Checks options={statuses} value={form.draft.commsChatStatuses} onChange={(v) => form.set("commsChatStatuses", v)} />
      </div>
      <Toggle label="Allow the customer to call the provider" checked={form.draft.commsCallEnabled} onChange={(v) => form.set("commsCallEnabled", v)} />
      <div>
        <p className={labelCls}>Calling is allowed while the order is…</p>
        <Checks options={statuses} value={form.draft.commsCallStatuses} onChange={(v) => form.set("commsCallStatuses", v)} />
      </div>
      <Num label="Keep chat and calls open after completion (hours)" hint="0 = closed as soon as the order is completed (the current behaviour). Admins can always read conversations." value={form.draft.commsAfterCompletionHours} min={0} max={720} onChange={(v) => form.set("commsAfterCompletionHours", v)} />
    </Card>
  );
}

// ------------------------------------------------------------ staff & permissions

function StaffTab({ data, save }) {
  const navigate = useNavigate();
  const keys = useMemo(() => ["providerStaffEnabled", "providerStaffMax", "providerStaffRoleTemplates"], []);
  const s = data.settings;
  const form = useDraft(s, keys);
  const [role, setRole] = useState(Object.keys(data.options.staffRoleTemplates)[0]);
  // The editor works on the effective templates; saving stores them all.
  const templates = form.draft.providerStaffRoleTemplates || data.options.staffRoleTemplates;
  const perms = new Set(templates[role] || []);
  const toggle = (p) => {
    const next = new Set(perms);
    next.has(p) ? next.delete(p) : next.add(p);
    form.set("providerStaffRoleTemplates", { ...templates, [role]: [...next] });
  };
  const usingDefaults = !s.providerStaffRoleTemplates;

  return (
    <div className="space-y-4">
      <div className="max-w-2xl rounded-2xl bg-violet-50 p-4 text-[12.5px] text-violet-900">
        <p className="font-semibold">Your own team (admin portal)</p>
        <p className="mt-0.5">Roles and permissions for your internal staff are managed in User Management.</p>
        <button onClick={() => navigate("/users")} className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white">
          Open User Management
        </button>
      </div>

      <Card title="Service provider staff" desc="Companies can add employees to their provider account." form={form} save={save}>
        <Toggle label="Allow providers to add staff" hint="Existing staff keep working when this is off." checked={form.draft.providerStaffEnabled} onChange={(v) => form.set("providerStaffEnabled", v)} />
        <Num label="Maximum active staff per provider" value={form.draft.providerStaffMax} min={1} max={500} onChange={(v) => form.set("providerStaffMax", v)} />
        <div>
          <p className={labelCls}>Default access for each staff role</p>
          <p className="mb-2 text-[11.5px] text-gray-400">Choosing a role when adding staff fills in this access; providers can still adjust it per person. Changing a template doesn't alter existing staff.</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.keys(templates).map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${role === r ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="space-y-2.5 rounded-xl border border-gray-100 p-3">
            {data.options.staffPermissionGroups.map((g) => (
              <div key={g.key}>
                <p className="text-[12px] font-bold text-gray-800">{g.label}</p>
                {g.permissions.map((p) => (
                  <label key={p.key} className="mt-1 flex items-start gap-2 text-[12.5px] text-gray-600">
                    <input type="checkbox" className="mt-0.5" checked={perms.has(p.key)} onChange={() => toggle(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {!usingDefaults && (
            <button className="mt-2 text-[12px] font-semibold text-brand underline" onClick={async () => (await save({ providerStaffRoleTemplates: null }, "Role defaults reset")) && form.reset()}>
              Reset all roles to the built-in defaults
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------- complaints

function ComplaintsTab({ data, save }) {
  const navigate = useNavigate();
  const keys = useMemo(() => ["complaintCategories", "complaintOutcomes"], []);
  const form = useDraft(data.settings, keys);
  const asText = (list) => (list || []).join("\n");
  const toList = (text) => text.split("\n");
  return (
    <div className="space-y-4">
      <div className="max-w-2xl rounded-2xl bg-violet-50 p-4 text-[12.5px] text-violet-900">
        <p className="font-semibold">Complaint pipeline stages</p>
        <p className="mt-0.5">Rename, reorder, add or hide stages under Complaints &amp; Disputes → Pipeline &amp; staff.</p>
        <button onClick={() => navigate("/complaints")} className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white">
          Open Complaints
        </button>
      </div>
      <Card title="Complaint lists" desc="One item per line. Changing these doesn't alter complaints already logged." form={form} save={save}>
        <div>
          <label className={labelCls}>Complaint categories</label>
          <textarea rows={7} className={inputCls} value={asText(form.draft.complaintCategories)} onChange={(e) => form.set("complaintCategories", toList(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Resolution outcomes</label>
          <textarea rows={7} className={inputCls} value={asText(form.draft.complaintOutcomes)} onChange={(e) => form.set("complaintOutcomes", toList(e.target.value))} />
        </div>
      </Card>
    </div>
  );
}
