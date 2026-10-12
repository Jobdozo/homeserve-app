import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { SubHeader, PillTabs, Card, Empty } from "../components/biz";
import { StarIcon, ChatIcon } from "../components/icons";

// What customers say: reviews with a reply box, and complaints Tikdum opened
// about a job with a reply-by time. Open complaints sit on top.
export default function FeedbackScreen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "reviews";
  const { showToast } = useApp();
  const [reviews, setReviews] = useState(null);
  const [complaints, setComplaints] = useState(null);

  useEffect(() => {
    api.listReviews().then(setReviews).catch(() => setReviews({ total: 0, average: null, stars: [], reviews: [] }));
    api.listComplaints().then(setComplaints).catch(() => setComplaints([]));
  }, []);

  const open = (complaints || []).filter((c) => c.open);

  return (
    <div className="flex flex-col pb-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <SubHeader title="What customers say" />
      <PillTabs
        className="mt-3.5"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        items={[
          { id: "reviews", label: "Reviews", count: reviews?.total || 0 },
          { id: "complaints", label: "Complaints", count: open.length, hot: open.length > 0 },
        ]}
      />
      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {tab === "reviews" && (
          <>
            {open.length > 0 && <OpenComplaintNudge count={open.length} onOpen={() => setParams({ tab: "complaints" }, { replace: true })} />}
            {!reviews && <div className="h-40 animate-pulse rounded-[22px] bg-card" />}
            {reviews && reviews.total === 0 && <Empty icon={<StarIcon width={30} height={30} />} title="No reviews yet" text="After a job, customers rate you here. Replying to them shows on your Tikdum profile." />}
            {reviews && reviews.total > 0 && (
              <>
                <RatingSummary data={reviews} />
                {reviews.reviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    onReplied={(reply) => setReviews((d) => ({ ...d, reviews: d.reviews.map((x) => (x.id === r.id ? { ...x, reply } : x)) }))}
                    showToast={showToast}
                  />
                ))}
              </>
            )}
          </>
        )}
        {tab === "complaints" && (
          <>
            {!complaints && <div className="h-40 animate-pulse rounded-[22px] bg-card" />}
            {complaints && complaints.length === 0 && <Empty icon={<ChatIcon width={30} height={30} />} title="No complaints" text="If a customer raises a problem with a job, Tikdum's team opens it here and you can give your side." />}
            {complaints?.map((c) => (
              <ComplaintCard key={c.id} complaint={c} onUpdated={(next) => setComplaints((list) => list.map((x) => (x.id === c.id ? next : x)))} showToast={showToast} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function OpenComplaintNudge({ count, onOpen }) {
  return (
    <button onClick={onOpen} className="flex items-center justify-between gap-3 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3.5 text-left">
      <span>
        <span className="block text-[12px] font-extrabold uppercase tracking-[0.12em] text-red-700">
          {count} open complaint{count === 1 ? "" : "s"}
        </span>
        <span className="block text-[13.5px] text-red-800">Reply within 24 hours so Tikdum hears your side</span>
      </span>
      <span className="text-[13.5px] font-extrabold text-red-700 underline">Open</span>
    </button>
  );
}

function RatingSummary({ data }) {
  const max = Math.max(1, ...data.stars.map((s) => s.count));
  return (
    <Card className="flex items-center gap-5 p-4">
      <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
        <span className="font-display text-[44px] font-extrabold leading-none text-ink">{data.average ?? "—"}</span>
        <span className="flex gap-0.5 text-marigold" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <StarIcon key={n} filled={data.average >= n - 0.25} width={14} height={14} />
          ))}
        </span>
        <span className="text-[12px] text-ink-muted">
          {data.total} rating{data.total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 text-[12px] text-ink-muted tabular">
        {data.stars.map((s) => (
          <div key={s.stars} className="flex items-center gap-2">
            <span className="w-2.5">{s.stars}</span>
            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-gray-200">
              <span className={`block h-full ${s.stars >= 4 ? "bg-go" : s.stars === 3 ? "bg-marigold" : "bg-red-500"}`} style={{ width: `${(s.count / max) * 100}%` }} />
            </span>
            <span className="w-6 text-right">{s.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReviewCard({ review, onReplied, showToast }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const tone = review.rating >= 4 ? "bg-go-wash text-go-soft" : review.rating === 3 ? "bg-marigold-wash text-marigold-soft" : "bg-red-50 text-red-700";
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      onReplied(await api.replyToReview(review.id, text));
      setText("");
      showToast("Reply posted on your profile");
    } catch (err) {
      showToast(err.message || "Couldn't post the reply");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold text-ink">{review.customerName}</p>
          <p className="truncate text-[12px] text-ink-muted">
            {review.serviceName} · {ago(review.date)}
          </p>
        </div>
        <span className={`rounded-lg px-2 py-0.5 text-[13px] font-extrabold ${tone}`}>{review.rating} ★</span>
      </div>
      {review.text && <p className="text-[14px] leading-relaxed text-ink-soft">{review.text}</p>}
      {review.reply ? (
        <div className="rounded-[14px] bg-raised px-3 py-2.5">
          <p className="text-[12px] font-extrabold text-brand-dark">Your reply</p>
          <p className="text-[13.5px] leading-snug text-ink-soft">{review.reply.text}</p>
        </div>
      ) : (
        <form onSubmit={send} className="flex h-[46px] items-center gap-2 rounded-[14px] border-[1.5px] border-gray-200 pl-3.5 pr-1.5">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={review.rating >= 4 ? "Say thanks…" : "Reply politely — everyone can see it"} aria-label={`Reply to ${review.customerName}`} className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint" />
          <button type="submit" disabled={busy || !text.trim()} className="h-[34px] rounded-[10px] bg-brand-glow px-3 text-[13px] font-extrabold text-ground disabled:opacity-40">
            Reply
          </button>
        </form>
      )}
    </Card>
  );
}

function ComplaintCard({ complaint: c, onUpdated, showToast }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const overdue = c.open && Date.parse(c.replyBy) < Date.now() && c.replies.length === 0;
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      onUpdated(await api.replyToComplaint(c.id, text));
      setText("");
      showToast("Sent to Tikdum's support team");
    } catch (err) {
      showToast(err.message || "Couldn't send");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex flex-col gap-2.5 rounded-[20px] p-4 ${c.open ? "border border-red-200 bg-red-50" : "bg-card"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[12px] font-extrabold uppercase tracking-[0.12em] ${c.open ? "text-red-700" : "text-ink-muted"}`}>{c.open ? `Open · ${c.status}` : c.status}</span>
        {c.open && c.replies.length === 0 && (
          <span className={`text-[12.5px] font-bold ${overdue ? "text-red-700" : "text-red-800"}`}>{overdue ? "Reply overdue" : `Reply by ${byTime(c.replyBy)}`}</span>
        )}
      </div>
      <p className="text-[15px] font-bold text-ink">“{c.subject}”</p>
      {c.description && c.description !== c.subject && <p className="text-[13.5px] leading-relaxed text-ink-soft">{c.description}</p>}
      <p className="text-[12.5px] text-ink-muted">
        {c.customerName}
        {c.service ? ` · ${c.service}` : ""}
        {c.bookingRef ? ` · Job #${c.bookingRef}` : ""} · {ago(c.createdAt)}
      </p>
      {c.replies.map((r) => (
        <div key={r.at} className="rounded-[14px] bg-card px-3 py-2.5">
          <p className="text-[12px] font-extrabold text-brand-dark">Your reply · {ago(r.at)}</p>
          <p className="text-[13.5px] leading-snug text-ink-soft">{r.text}</p>
        </div>
      ))}
      {c.resolution && (
        <p className="rounded-[14px] bg-card px-3 py-2.5 text-[13px] text-ink-soft">
          <span className="font-bold text-ink">Resolved: {c.resolution.outcome}.</span> {c.resolution.summary}
        </p>
      )}
      {c.open && (
        <form onSubmit={send} className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="What happened on your side, and what you can offer (a free revisit, a refund)…" aria-label="Your reply to this complaint" className="rounded-[14px] border border-gray-200 bg-card px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-brand" />
          <button type="submit" disabled={busy || !text.trim()} className="h-11 rounded-[14px] bg-ink text-[14px] font-extrabold text-ground disabled:opacity-40">
            {busy ? "Sending…" : "Send to Tikdum"}
          </button>
        </form>
      )}
    </div>
  );
}

function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
const byTime = (iso) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return `${today ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", "}${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
};
