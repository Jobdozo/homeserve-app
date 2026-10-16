import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { StarIcon } from "../components/icons";
import { ProviderMark } from "../components/ui";
import LogoMark from "../components/LogoMark";
import Seo from "../components/Seo";

const WORDS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];

// tikdum.com/rate/<token>: the customer's personal link from the WhatsApp request. Rate the job
// in one tap without signing in; the link only works for that booking, once (server:
// reviewRequests.js).
export default function RateLinkScreen() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getReviewLink(token)
      .then(setInfo)
      .catch((e) => setError(e.message || "This rating link isn't valid"));
  }, [token]);

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await api.submitReviewLink(token, rating, text);
      setDone(true);
    } catch (e) {
      setError(e.message || "Couldn't save your rating. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-mist px-5 pb-10 pt-8">
      <Seo title="Rate your service" path={`/rate/${token}`} noindex />
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
        <LogoMark size={24} />
      </span>
      <div className="mt-5 w-full max-w-md rounded-[26px] bg-white p-6 text-center shadow-card">
        {!info && !error && <div className="skeleton mx-auto h-40 w-full rounded-2xl" />}

        {error && !done && (
          <>
            <p className="font-display text-[20px] font-extrabold text-ink">{error}</p>
            <Link to="/home" className="mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-[14px] font-bold text-white">
              Go to Tikdum
            </Link>
          </>
        )}

        {info && !error && (done || !info.canRate) && (
          <>
            <div className="mx-auto flex w-fit gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <StarIcon key={n} filled={n <= (done ? rating : info.rating || 0)} width={28} height={28} />
              ))}
            </div>
            <p className="mt-4 font-display text-[22px] font-extrabold text-ink">{done ? "Thank you!" : info.reason}</p>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">Your rating helps other families in your area choose the right professional.</p>
            <Link to="/home" className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 text-[14px] font-bold text-white">
              Book another service
            </Link>
          </>
        )}

        {info && !error && !done && info.canRate && (
          <>
            {info.provider && (
              <div className="mx-auto flex w-fit items-center gap-2.5 rounded-2xl bg-mist px-3.5 py-2.5 text-left">
                <ProviderMark provider={info.provider} className="h-10 w-10 rounded-xl text-[15px]" />
                <div>
                  <p className="text-[13.5px] font-bold text-ink">{info.provider.name}</p>
                  <p className="text-[12px] text-ink-muted">{info.service}</p>
                </div>
              </div>
            )}
            <h1 className="mt-5 font-display text-[24px] font-extrabold leading-tight text-ink">
              {info.customerName ? `${info.customerName}, how` : "How"} was your {info.service}?
            </h1>
            <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} className="rounded-xl p-1 active:scale-90">
                  <StarIcon filled={n <= rating} width={40} height={40} />
                </button>
              ))}
            </div>
            <p className="mt-2 h-5 text-[14px] font-bold text-brand">{WORDS[rating]}</p>
            {rating > 0 && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={rating >= 4 ? "What did you like? (optional)" : "What went wrong? (optional)"}
                  className="mt-4 w-full resize-none rounded-2xl border border-line bg-mist px-3.5 py-3 text-[14px] text-ink outline-none focus:border-brand"
                />
                <button onClick={submit} disabled={saving} className="mt-4 w-full rounded-full bg-brand py-3.5 text-[15px] font-bold text-white active:scale-[0.99] disabled:opacity-60">
                  {saving ? "Saving…" : "Submit rating"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
