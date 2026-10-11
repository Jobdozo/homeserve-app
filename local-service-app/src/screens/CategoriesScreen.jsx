import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { SearchIcon, ChevronRightIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "../components/CategoryPhoto";
import CartBar from "../components/CartBar";
import Seo from "../components/Seo";
import ComingSoon from "../components/ComingSoon";
import DesktopCategories from "../components/DesktopCategories";
import { TabTitle, inr } from "../components/ui";

// Every category as a photo tile with what it starts at, so the customer sees prices before tapping.
export default function CategoriesScreen() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { categories, services, showToast, noCoverage } = useApp();

  const stats = useMemo(() => {
    const out = {};
    for (const s of services) {
      const st = (out[s.categoryId] = out[s.categoryId] || { count: 0, min: Infinity, pros: new Set() });
      st.count += 1;
      st.min = Math.min(st.min, Number(s.price) || Infinity);
      st.pros.add(s.providerId);
    }
    return out;
  }, [services]);

  return (
    <>
      <Seo
        title="Service Categories"
        description="Browse every home service category on Tikdum — cleaning, pest control, AC repair, and more — and find trusted local providers near you."
        path="/categories"
      />
      {/* Desktop gets its own full-width page (components/DesktopCategories). */}
      {isDesktop && (
        <div className="hidden lg:block">
          <DesktopCategories />
        </div>
      )}
      <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-4 lg:hidden">
        <TabTitle title="Categories" subtitle={noCoverage ? undefined : `${categories.length} kinds of home services`} />

        {noCoverage ? (
          <div className="p-4">
            <ComingSoon />
          </div>
        ) : (
          <>
            <div className="px-4 pt-2">
              <button
                onClick={() => navigate("/search")}
                className="flex h-12 w-full items-center gap-2.5 rounded-2xl bg-white px-4 text-left text-[14.5px] text-ink-muted shadow-card active:scale-[0.99]"
              >
                <SearchIcon width={19} height={19} className="text-brand" strokeWidth={2.4} />
                Search any service
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 px-4">
              {categories.map((c, i) => {
                const st = stats[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/category/${c.id}`)}
                    className="flex animate-fade-up flex-col overflow-hidden rounded-[20px] bg-white text-left shadow-card active:scale-[0.98]"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="block h-[112px] bg-brand-light">
                      <CategoryPhoto categoryId={c.id} imageUrl={c.imageUrl} size={112} />
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 p-3">
                      <span className="line-clamp-2 text-[14.5px] font-bold leading-snug text-ink">{c.name}</span>
                      <span className="mt-auto text-[12px] text-ink-muted">
                        {st ? (
                          <>
                            From <b className="text-ink">{inr(st.min)}</b> · {st.pros.size} pro{st.pros.size === 1 ? "" : "s"}
                          </>
                        ) : (
                          "Coming soon near you"
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => showToast("Thanks! We'll notify you when it's available.")}
              className="mx-4 mt-5 flex items-center justify-between gap-3 rounded-[22px] bg-brand-night px-4 py-4 text-left active:scale-[0.99]"
            >
              <span>
                <span className="block text-[11.5px] font-bold uppercase tracking-[0.12em] text-marigold">Can't find it?</span>
                <span className="block font-display text-[18px] font-bold leading-tight text-white">Tell us — we'll add it for you</span>
              </span>
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-marigold text-ink">
                <ChevronRightIcon width={20} height={20} />
              </span>
            </button>
          </>
        )}
        <CartBar />
      </div>
    </>
  );
}
