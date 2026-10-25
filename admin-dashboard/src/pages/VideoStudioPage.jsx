import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Video Studio (server: videoStudio.js). Ask for a video in your own words; the Video Studio Agent
// writes the scenes, voice lines and caption; the server makes it with Google's video AI (one at a
// time, within the day's limit); you preview it here and publish it — or remake or delete it.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const STATUS = {
  script: ["Writing the script", "bg-amber-50 text-amber-800"],
  queued: ["Waiting to be made", "bg-blue-50 text-blue-700"],
  making: ["Making the video… (a few minutes)", "bg-violet-50 text-violet-700"],
  ready: ["Ready — preview and publish", "bg-emerald-50 text-emerald-700"],
  failed: ["Failed", "bg-red-50 text-red-700"],
  published: ["Published", "bg-gray-100 text-gray-600"],
};
const CHANNELS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["threads", "Threads"],
  ["youtube", "YouTube"],
];

function NewVideo({ estimates, categories, onMade, busy, run }) {
  const [f, setF] = useState({ idea: "", kind: "pictures", length: "story", aspect: "upright", category: "", voice: "", subtitles: true });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => api.addVideoJob({ ...f, voice: f.voice || undefined, category: f.category || undefined }), "Added — the agent writes the script next");
    if (ok) {
      setF((p) => ({ ...p, idea: "" }));
      onMade();
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <h2 className="text-[14px] font-bold text-gray-900">New video</h2>
      <label className="block">
        <span className={labelCls}>What should the video show?</span>
        <textarea className={`${inputCls} min-h-[70px]`} value={f.idea} onChange={set("idea")} placeholder="e.g. Diwali deep cleaning — a tired family, a Tikdum team cleaning the house, the home glowing for the festival" required minLength={5} maxLength={400} />
      </label>
      <div className="grid gap-3 sm:grid-cols-5">
        <label>
          <span className={labelCls}>Made as</span>
          <select className={inputCls} value={f.kind} onChange={set("kind")}>
            <option value="pictures">Picture story — cheap</option>
            <option value="ai">AI video — real footage, costly</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Length</span>
          <select className={inputCls} value={f.length} onChange={set("length")}>
            <option value="story">Story, 3 scenes · ~₹{f.kind === "ai" ? estimates?.aiStory : estimates?.story}</option>
            <option value="short">Short, 1 scene · ~₹{f.kind === "ai" ? estimates?.aiShort : estimates?.short}</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Shape</span>
          <select className={inputCls} value={f.aspect} onChange={set("aspect")}>
            <option value="upright">Upright 9:16 — Reels, Shorts</option>
            <option value="wide">Wide 16:9 — YouTube, website</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Service (for colours and the Book card)</span>
          <select className={inputCls} value={f.category} onChange={set("category")}>
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.category}>{c.category}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Voice</span>
          <select className={inputCls} value={f.voice} onChange={set("voice")}>
            <option value="">As in settings</option>
            <option value="hinglish">Hinglish</option>
            <option value="english">English</option>
            <option value="none">No voice (music only)</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={f.subtitles} onChange={set("subtitles")} />
          Subtitles (most people watch without sound)
        </label>
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
          Make video
        </button>
      </div>
    </form>
  );
}

function Sets({ estimates, categories, run, onMade }) {
  const [aspect, setAspect] = useState("upright");
  const [length, setLength] = useState("story");
  const [videoKind, setVideoKind] = useState("pictures");
  const make = async (kind) => {
    const n = kind === "categories" ? categories.length : "up to 10";
    const each = (videoKind === "ai" ? estimates?.[length === "story" ? "aiStory" : "aiShort"] : estimates?.[length]) || 0;
    if (!window.confirm(`Make ${n} ${kind === "categories" ? "category" : "festival"} videos (${videoKind === "ai" ? "AI video" : "picture story"}, ${length}, ${aspect})? About ₹${each} each, made within the daily limit over the next days.`)) return;
    if (await run(() => api.addVideoSet({ kind, aspect, length, videoKind }), "Added to the queue")) onMade();
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <h2 className="text-[14px] font-bold text-gray-900">Ready-made sets</h2>
      <p className="mt-0.5 text-[12px] text-gray-500">One advert for every service category, or a video for each festival in the next 45 days (from the Social Media calendar). They're made a few a day, within the daily limit.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px]" value={videoKind} onChange={(e) => setVideoKind(e.target.value)}>
          <option value="pictures">Picture stories (cheap)</option>
          <option value="ai">AI video (costly)</option>
        </select>
        <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px]" value={length} onChange={(e) => setLength(e.target.value)}>
          <option value="story">Stories (~30 s)</option>
          <option value="short">Shorts (~12 s)</option>
        </select>
        <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px]" value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="upright">Upright 9:16</option>
          <option value="wide">Wide 16:9</option>
        </select>
        <button onClick={() => make("categories")} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">One per category</button>
        <button onClick={() => make("festivals")} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">Festival videos</button>
      </div>
    </div>
  );
}

function JobCard({ job, connected, run, reload }) {
  const [caption, setCaption] = useState(job.script?.caption || "");
  const [channels, setChannels] = useState(() => CHANNELS.map(([k]) => k).filter((k) => connected?.[k]));
  useEffect(() => setCaption(job.script?.caption || ""), [job.script?.caption]);
  const [label, cls] = STATUS[job.status] || [job.status, "bg-gray-100 text-gray-600"];
  const toggle = (k) => setChannels((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const publish = () =>
    window.confirm(`Publish "${job.script?.title}" on ${channels.join(", ")} now?`) && run(() => api.publishVideoJob(job.id, { channels, caption }), "Publishing — it goes out over the next few minutes").then(reload);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {job.video ? (
          <video src={job.video.url} poster={job.cover || undefined} controls preload="metadata" className={`flex-shrink-0 rounded-xl bg-black ${job.aspect === "wide" ? "w-full sm:w-[360px]" : "h-[360px] w-[203px]"}`} />
        ) : (
          <div className={`flex flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[12px] text-gray-400 ${job.aspect === "wide" ? "h-[160px] w-full sm:w-[284px]" : "h-[300px] w-[169px]"}`}>{job.status === "making" ? "Making…" : "No video yet"}</div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
            <span className="text-gray-400">
              {job.kind === "ai" ? "AI video" : "Picture story"} · {job.length === "short" ? "1 scene" : "3 scenes"} · {job.aspect === "wide" ? "16:9" : "9:16"} · voice {job.voice} · ~₹{job.estimateInr}
              {job.video?.seconds ? ` · ${job.video.seconds} s` : ""}
            </span>
          </div>
          <p className="text-[14px] font-bold text-gray-900">{job.script?.title || job.idea}</p>
          {job.script && (
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-gray-600">
              {job.script.scenes.map((s, i) => (
                <li key={i}>
                  <span className="font-semibold text-gray-800">“{s.line}”</span> — {s.video}
                </li>
              ))}
            </ol>
          )}
          {job.status === "queued" && <p className="text-[12px] text-gray-500">Made in order, within today's limit (change it above). If the limit is reached it's made tomorrow.</p>}
          {job.error && <p className="text-[12px] text-red-600">{job.error}</p>}
          {job.voiceMissing && <p className="text-[12px] text-amber-700">The voice couldn't be made for some lines — the subtitles carry them.</p>}
          {job.status === "ready" && (
            <div className="space-y-2 border-t border-gray-100 pt-2">
              <label className="block">
                <span className={labelCls}>Caption</span>
                <textarea className={`${inputCls} min-h-[80px]`} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-gray-700">
                {CHANNELS.map(([k, name]) => (
                  <label key={k} className={`flex items-center gap-1.5 ${connected?.[k] ? "" : "opacity-40"}`} title={connected?.[k] ? "" : "Not connected"}>
                    <input type="checkbox" className="h-4 w-4 accent-brand" disabled={!connected?.[k]} checked={channels.includes(k)} onChange={() => toggle(k)} />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {job.status === "ready" && (
              <button onClick={publish} disabled={!channels.length} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                Publish
              </button>
            )}
            {job.video && (
              <a href={job.video.url} download className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                Download
              </a>
            )}
            {["ready", "failed", "published"].includes(job.status) && (
              <>
                <button onClick={() => window.confirm(`Make it again with the same script? About ₹${job.estimateInr}.`) && run(() => api.remakeVideoJob(job.id, false), "Queued again").then(reload)} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                  Remake
                </button>
                <button onClick={() => window.confirm(`New script and new video? About ₹${job.estimateInr}.`) && run(() => api.remakeVideoJob(job.id, true), "The agent writes a new script").then(reload)} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                  New script
                </button>
              </>
            )}
            {job.status !== "making" && (
              <button onClick={() => window.confirm("Delete this video?") && run(() => api.deleteVideoJob(job.id), "Deleted").then(reload)} className="ml-auto rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-gray-400 hover:text-red-600">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoStudioPage() {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.getVideoStudio().then(setData).catch((e) => showToast(e.message || "Couldn't load Video Studio")), [showToast]);
  useEffect(() => {
    load();
    api.getImageColours().then((c) => setCategories(c || [])).catch(() => {});
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await load();
      return true;
    } catch (e) {
      showToast(e.message || "Couldn't do that");
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>;
  const cfg = data.config;
  const saveCfg = (patch, msg) => run(() => api.setVideoStudioConfig(patch), msg);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[620px]">
            <h2 className="text-[14px] font-bold text-gray-900">Video Studio</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
              Videos with a voice-over, subtitles, your logo and a "Book" card. The Video Studio Agent writes each script. <b>Picture stories</b> (AI pictures that move, about ₹{data.estimates.story} a video) are the default; <b>AI video</b> (real-looking footage, about ₹{data.estimates.aiStory} a story) is for special ones. Today: {data.picturesToday} of {data.picturesPerDay} picture stories, <b>{data.startedToday}</b> of {cfg.perDay} AI videos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
            <label className="flex items-center gap-1.5">
              AI videos a day
              <select className="rounded-lg border border-gray-200 px-2 py-1" value={cfg.perDay} onChange={(e) => saveCfg({ perDay: Number(e.target.value) }, `Up to ${e.target.value} a day`)}>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Voice
              <select className="rounded-lg border border-gray-200 px-2 py-1" value={cfg.voice} onChange={(e) => saveCfg({ voice: e.target.value }, "Saved")}>
                <option value="hinglish">Hinglish</option>
                <option value="english">English</option>
                <option value="none">None</option>
              </select>
            </label>
            <select className="rounded-lg border border-gray-200 px-2 py-1" value={cfg.voiceGender} onChange={(e) => saveCfg({ voiceGender: e.target.value }, "Saved")}>
              <option value="female">Female voice</option>
              <option value="male">Male voice</option>
            </select>
          </div>
        </div>
      </div>
      <NewVideo estimates={data.estimates} categories={categories} onMade={load} busy={busy} run={run} />
      <Sets estimates={data.estimates} categories={categories} run={run} onMade={load} />
      {data.jobs.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-gray-400">No videos yet — describe one above.</p>
      ) : (
        <div className="space-y-3">
          {data.jobs.map((j) => (
            <JobCard key={j.id} job={j} connected={data.connected} run={run} reload={load} />
          ))}
        </div>
      )}
    </div>
  );
}
