import { useCallback, useEffect, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";

// Image Studio branding (server/src/imageStyle.js): the checklist on each preview, each
// category's picture colour and the stamped logo, and the pictures an approved one replaced.

// What Tikdum knew when the picture was asked for, and what was done to it — shown with each preview.
export function Checklist({ checks, drawn }) {
  const rows = [[checks.record, ["Found in Tikdum", checks.category, checks.type, checks.includes ? `${checks.includes} included items used` : ""].filter(Boolean).join(" · ")]];
  if (drawn) {
    rows.push([checks.logo, checks.logo ? "Tikdum logo added" : "No logo (the logo stamp is switched off)"]);
    if (checks.size) rows.push([true, `Size ${checks.size}`]);
  }
  return (
    <ul className="space-y-0.5 text-[11px] text-gray-600">
      {rows.map(([ok, text]) => (
        <li key={text}>
          <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "⚠"}</span> {text}
        </li>
      ))}
      {checks.colour && (
        <li className="flex items-center gap-1.5">
          <span className="text-emerald-600">✓</span>
          <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: checks.colour.hex }} />
          Colour: {checks.colour.name}
        </li>
      )}
    </ul>
  );
}

// Each category's picture colour (no two the same) and the logo stamped on every picture.
export function BrandPanel() {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [colours, setColours] = useState(null);
  const [draft, setDraft] = useState({}); // slug -> { hex, name }
  const [logo, setLogo] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!open || colours) return;
    api.getImageColours().then(setColours).catch((e) => showToast(e.message));
    api.getImageLogo().then(setLogo).catch(() => {});
  }, [open, colours, showToast]);

  const value = (c) => draft[c.slug] || { hex: c.hex, name: c.name };
  const save = async (c) => {
    setSaving(c.slug);
    try {
      const v = value(c);
      setColours(await api.setImageColour(c.slug, v.hex, v.name));
      setDraft((d) => ({ ...d, [c.slug]: undefined }));
      showToast(`${c.category}: ${v.name} — used for new pictures`);
    } catch (e) {
      showToast(e.message || "Couldn't save the colour");
    }
    setSaving(null);
  };
  const upload = async (file) => {
    if (!file) return;
    try {
      setLogo(await api.uploadImageLogo(file));
      showToast("Logo saved — new pictures use it");
    } catch (e) {
      showToast(e.message || "Couldn't upload the logo");
    }
  };
  const useBuiltIn = async () => {
    try {
      setLogo(await api.clearImageLogo());
      showToast("Back to the built-in badge");
    } catch (e) {
      showToast(e.message || "Couldn't change the logo");
    }
  };

  return (
    <details className="rounded-2xl bg-white p-4 shadow-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-[13px] font-bold text-gray-900">Colours &amp; logo</summary>
      <p className="mt-1 text-[12px] text-gray-500">
        Each category has its own colour: the AI uses it in small details (towels, cloths, uniform trim) and it rings the logo. Types use a lighter shade. Changes apply to new pictures.
      </p>
      {!colours && open && <p className="mt-3 text-[12px] text-gray-400">Loading…</p>}
      {colours && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {colours.map((c) => {
            const v = value(c);
            const changed = v.hex.toLowerCase() !== c.hex.toLowerCase() || v.name !== c.name;
            return (
              <div key={c.slug} className="flex items-center gap-2 rounded-xl border border-gray-100 p-2">
                <input
                  type="color"
                  value={v.hex}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.slug]: { ...v, hex: e.target.value } }))}
                  className="h-8 w-10 flex-shrink-0 cursor-pointer rounded border border-gray-200"
                  aria-label={`${c.category} colour`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-800">{c.category}</p>
                  <input
                    value={v.name}
                    maxLength={30}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.slug]: { ...v, name: e.target.value } }))}
                    className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-[11.5px] text-gray-600"
                    aria-label={`${c.category} colour name`}
                  />
                </div>
                {changed && (
                  <button disabled={saving === c.slug} onClick={() => save(c)} className="rounded-lg bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">
                    {saving === c.slug ? "…" : "Save"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {logo && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
          <div className="flex h-12 min-w-[120px] items-center justify-center rounded-lg bg-gray-800 px-3">
            {logo.custom && logo.url ? <img src={SERVER_URL + logo.url} alt="Picture logo" className="max-h-9" /> : <span className="text-[11.5px] text-white">Built-in Tikdum badge</span>}
          </div>
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700">
            Upload logo (PNG)
            <input type="file" accept="image/png" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {logo.custom && (
            <button onClick={useBuiltIn} className="text-[12px] font-semibold text-gray-500 underline">
              Use the built-in badge
            </button>
          )}
          <span className="text-[11px] text-gray-400">The real file is stamped on — the AI never draws the logo.</span>
        </div>
      )}
    </details>
  );
}

// Pictures an approved AI picture replaced (last 3 per item), to put back if needed.
export function KeptPictures() {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.listKeptImages().then(setRows).catch(() => setRows([])), []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restore = async (r) => {
    if (!window.confirm(`Put the earlier picture of "${r.name}" back? It replaces the current one straight away.`)) return;
    setBusy(r.id);
    try {
      await api.restoreKeptImage(r.id);
      showToast(`"${r.name}": earlier picture restored`);
      load();
    } catch (e) {
      showToast(e.message || "Couldn't restore it");
    }
    setBusy(null);
  };

  return (
    <details className="rounded-2xl bg-white p-4 shadow-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-[13px] font-bold text-gray-900">Replaced pictures</summary>
      <p className="mt-1 text-[12px] text-gray-500">When you use an AI picture, the one it replaces is kept here (the last 3 for each item).</p>
      {rows?.length === 0 && <p className="mt-3 text-[12px] text-gray-400">Nothing replaced yet.</p>}
      {rows?.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-gray-100 p-2">
              <img src={SERVER_URL + r.url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-gray-800">{r.name}</p>
                <p className="text-[11px] text-gray-400">
                  <span className="capitalize">{r.targetType}</span> · replaced {new Date(r.keptAt).toLocaleDateString("en-IN")}
                  {r.restoredAt ? " · restored" : ""}
                </p>
              </div>
              <button disabled={busy === r.id} onClick={() => restore(r)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 disabled:opacity-50">
                {busy === r.id ? "…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
