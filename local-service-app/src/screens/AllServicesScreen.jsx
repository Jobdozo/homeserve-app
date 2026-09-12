import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";

const SORTS = [
  { id: "popular", label: "Popular" },
  { id: "rating", label: "Top Rated" },
  { id: "discount", label: "Best Discount" },
  { id: "price-low", label: "Price: Low to High" },
  { id: "price-high", label: "Price: High to Low" },
];

function sortServices(services, sort) {
  const list = [...services];
  switch (sort) {
    case "rating":
      return list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "discount":
      return list.sort((a, b) => discountPct(b.price, b.originalPrice) - discountPct(a.price, a.originalPrice));
    case "price-low":
      return list.sort((a, b) => a.price - b.price);
    case "price-high":
      return list.sort((a, b) => b.price - a.price);
    default:
      return list.sort((a, b) => b.reviewCount - a.reviewCount);
  }
}

export default function AllServicesScreen() {
  const navigate = useNavigate();
  const { services } = useApp();
  const [sort, setSort] = useState("popular");

  const sorted = useMemo(() => sortServices(services, sort), [services, sort]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="All Services" subtitle={`${services.length} services available`} maxWidth="lg:max-w-4xl" />

      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-4xl lg:px-8 lg:pb-16">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                sort === s.id ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {sorted.map((s) => {
            const pct = discountPct(s.price, s.originalPrice);
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/service/${s.id}`)}
                className="relative overflow-hidden rounded-2xl bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {pct > 0 && (
                  <span className="absolute left-2 top-2 z-10 rounded-full bg-emerald-500 px-2 py-0.5 text-[9.5px] font-bold text-white">
                    {pct}% OFF
                  </span>
                )}
                <div className="flex h-24 items-center justify-center bg-brand-light lg:h-36">
                  <CategoryIcon categoryId={s.categoryId} size={56} transparent className="lg:scale-125" />
                </div>
                <div className="p-2.5 lg:p-4">
                  <p className="text-[12.5px] font-semibold text-gray-900 lg:text-[15px]">{s.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500 lg:text-[13px]">Starting ₹{s.price}</span>
                    {pct > 0 && <span className="text-[10px] text-gray-400 line-through">₹{s.originalPrice}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 lg:text-[13px]">
                    <StarIcon filled width={12} height={12} /> {s.rating} ({formatCount(s.reviewCount)})
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <CartBar />
    </div>
  );
}
