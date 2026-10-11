import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const SUGGESTED = ["Top rated", "Reliable", "Often late", "Needs training", "New", "Premium", "Watch closely"];
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const show = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

// Tags and private notes about the provider (only your team sees them), and everything changed on their account.
export function ProviderTagsEditor({ providerId, onSaved }) {
  const { showToast } = useApp();
  const [tags, setTags] = useState(null);
  const [all, setAll] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    api.getProviderTags(providerId).then(setTags).catch(() => setTags([]));
    api.listProviderTags().then(setAll).catch(() => {});
  }, [providerId]);

  const save = async (next) => {
    try {
      const saved = await api.setProviderTags(providerId, next);
      setTags(saved);
      onSaved?.(saved);
    } catch (e) {
      showToast(e.message || "Couldn't save the tags");
    }
  };
  if (!tags) return null;
  const options = [...new Set([...SUGGESTED, ...all])].filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-brand-light px-2.5 py-1 text-[11.5px] font-semibold text-brand-dark">
            {t}
            <button onClick={() => save(tags.filter((x) => x !== t))} className="text-brand-dark/60 hover:text-red-600" aria-label={`Remove ${t}`}>
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-[12px] text-gray-400">No tags yet.</span>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) save([...tags, input.trim()]).then(() => setInput(""));
        }}
        className="mt-2 flex gap-2"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} list="provider-tag-options" placeholder="Add a tag…" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-brand" />
        <datalist id="provider-tag-options">
          {options.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="submit" disabled={!input.trim()} className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {options.slice(0, 7).map((t) => (
          <button key={t} onClick={() => save([...tags, t])} className="rounded-full border border-dashed border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:border-brand hover:text-brand">
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProviderActivityTab({ providerId, onTagsSaved }) {
  const { showToast } = useApp();
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState(null);

  const loadNotes = () => api.listProviderNotes(providerId).then(setNotes).catch(() => setNotes([]));
  useEffect(() => {
    loadNotes();
    api.listAdminChanges({ entityType: "provider", entityId: providerId }).then(setLog).catch(() => setLog([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.addProviderNote(providerId, text.trim());
      setText("");
      await loadNotes();
    } catch (err) {
      showToast(err.message || "Couldn't save the note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="text-[13px] font-bold text-gray-900">Tags</p>
          <p className="mb-2 text-[11.5px] text-gray-400">Only your team sees these. Use them to find providers on the Providers page.</p>
          <ProviderTagsEditor providerId={providerId} onSaved={onTagsSaved} />
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="text-[13px] font-bold text-gray-900">Notes</p>
          <p className="mb-2 text-[11.5px] text-gray-400">Private to your team — calls, promises, warnings.</p>
          <form onSubmit={addNote} className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. Called on 11 Oct — will recharge on Monday" className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none focus:border-brand" />
            <button type="submit" disabled={saving || !text.trim()} className="rounded-lg bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              {saving ? "Saving…" : "Add note"}
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {notes === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {notes?.length === 0 && <p className="text-[12px] text-gray-400">No notes yet.</p>}
            {notes?.map((n) => (
              <div key={n.id} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="whitespace-pre-wrap text-[12.5px] text-gray-800">{n.text}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>
                    {n.by || "Admin"} · {when(n.at)}
                  </span>
                  <button onClick={() => api.deleteProviderNote(providerId, n.id).then(loadNotes).catch((e) => showToast(e.message))} className="hover:text-red-600">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 p-4">
        <p className="text-[13px] font-bold text-gray-900">Account history</p>
        <p className="mb-2 text-[11.5px] text-gray-400">Every change your team made to this provider.</p>
        <div className="max-h-[65vh] space-y-2 overflow-auto">
          {log === null && <p className="text-[12px] text-gray-400">Loading…</p>}
          {log?.length === 0 && <p className="text-[12px] text-gray-400">No changes recorded yet.</p>}
          {log?.map((e, i) => (
            <div key={e.id || i} className="border-b border-gray-50 pb-2 text-[12px] last:border-0">
              <p className="text-gray-800">
                <span className="font-semibold">{String(e.action || "").replace(/[._]/g, " ")}</span>
                <span className="text-gray-400"> · {e.actor || "admin"} · {when(e.at)}</span>
              </p>
              {(e.changes || []).map((c, j) => (
                <p key={j} className="text-gray-500">
                  {c.field}: <span className="text-red-500 line-through decoration-red-200">{show(c.from)}</span> → <span className="text-emerald-700">{show(c.to)}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
