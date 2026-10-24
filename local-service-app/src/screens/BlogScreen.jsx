import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { BackIcon, ChevronRightIcon } from "../components/icons";
import { SectionTitle } from "../components/ui";
import Seo from "../components/Seo";
import { parseArticle, inlineParts } from "../utils/articleText";

// tikdum.com/blog and tikdum.com/blog/<article>: home care tips and guides (server/src/blog.js),
// written by the SEO Agent and published by the team. The server sends search engines the same
// article in the page itself (seoPages.js); this is what people see.

const UPLOADS = "https://api.tikdum.com";
const pic = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `${u.startsWith("/uploads/") ? UPLOADS : ""}${u}`);
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");

function Header({ title, subtitle }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white px-4 pb-4 pt-2 shadow-[0_1px_0_#E8E5F2] lg:rounded-b-3xl">
      <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/home"))} aria-label="Go back" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink active:scale-95">
        <BackIcon width={19} height={19} />
      </button>
      <div className="pt-3.5">
        <h1 className="font-display text-[28px] font-extrabold leading-[1.08] text-ink [text-wrap:balance] lg:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

function Rich({ text }) {
  return inlineParts(text).map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <strong key={i} className="font-bold text-ink">{p.bold}</strong>));
}

function Loading() {
  return (
    <div className="space-y-3 p-4">
      <div className="skeleton h-24 rounded-[22px]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-28 rounded-[22px]" />
      ))}
    </div>
  );
}

export function BlogListScreen() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api.blogList().then(setList).catch(() => setList([]));
  }, []);
  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-8 lg:mx-auto lg:w-full lg:max-w-4xl lg:px-4">
      <Seo title="Home Care Tips & Guides" description="Tips and guides for your home in Jammu & Kashmir — seasonal maintenance, cleaning checklists, repairs and what to ask before you book — from Tikdum." path="/blog" />
      <Header title="Home care tips & guides" subtitle="Seasonal checklists, repairs and what to ask before you book — for homes across Jammu & Kashmir." />
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="px-4 py-12 text-center text-[14px] text-ink-muted">The first guides are on their way.</p>
      ) : (
        <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2">
          {list.map((a) => (
            <Link key={a.id} to={`/blog/${a.slug}`} className="group overflow-hidden rounded-[22px] bg-white shadow-card active:scale-[0.99]">
              {pic(a.coverUrl) && <img src={pic(a.coverUrl)} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
              <div className="p-4">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-brand">{a.category || "Home care"} · {a.readMinutes} min read</p>
                <h2 className="mt-1 font-display text-[18px] font-extrabold leading-snug text-ink [text-wrap:balance]">{a.title}</h2>
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{a.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogArticleScreen() {
  const { slug } = useParams();
  const { categories = [] } = useApp();
  const [a, setA] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setA(null);
    setMissing(false);
    api
      .blogArticle(slug)
      .then((x) => alive && setA(x))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug]);
  if (missing) return <Navigate to="/blog" replace />;
  if (!a) return <Loading />;
  const cat = categories.find((c) => c.id === a.category || String(c.name).toLowerCase() === String(a.category || "").toLowerCase());
  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-10 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-4">
      <Seo title={a.title} description={a.description} path={`/blog/${a.slug}`} image={pic(a.coverUrl)} />
      <Header title={a.title} subtitle={`${dateLabel(a.publishedAt)} · ${a.readMinutes} min read`} />
      {pic(a.coverUrl) && <img src={pic(a.coverUrl)} alt="" className="mx-4 mt-4 aspect-[16/9] rounded-[22px] object-cover shadow-card" />}
      <article className="mx-4 mt-4 rounded-[22px] bg-white px-5 py-6 shadow-card">
        <div className="max-w-[65ch] space-y-4 text-[15px] leading-[1.7] text-ink-soft">
          {parseArticle(a.body).map((b, i) =>
            b.type === "h2" ? (
              <h2 key={i} className="pt-2 font-display text-[20px] font-extrabold leading-snug text-ink [text-wrap:balance]">
                {b.text}
              </h2>
            ) : b.type === "ul" ? (
              <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-brand">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Rich text={it} />
                  </li>
                ))}
              </ul>
            ) : (
              <p key={i}>
                <Rich text={b.text} />
              </p>
            )
          )}
        </div>
      </article>

      {cat && (
        <Link to={`/category/${cat.id}`} className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-[22px] bg-brand-night px-5 py-4 text-white shadow-card active:scale-[0.99]">
          <span>
            <span className="block text-[12px] font-bold uppercase tracking-wide text-white/70">Book on Tikdum</span>
            <span className="block font-display text-[18px] font-extrabold">{cat.name} — verified local professionals</span>
          </span>
          <ChevronRightIcon width={20} height={20} className="flex-shrink-0" />
        </Link>
      )}

      {a.faqs?.length > 0 && (
        <section className="px-4 pt-7">
          <SectionTitle>Common questions</SectionTitle>
          <div className="mt-3 overflow-hidden rounded-[20px] bg-white shadow-card">
            {a.faqs.map((f, i) => (
              <details key={f.q} className={`group ${i ? "border-t border-line" : ""}`} open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[14.5px] font-bold text-ink">
                  {f.q}
                  <ChevronRightIcon width={16} height={16} className="flex-shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      <Link to="/blog" className="mx-4 mt-6 text-center text-[13.5px] font-bold text-brand">
        More home care tips →
      </Link>
    </div>
  );
}
