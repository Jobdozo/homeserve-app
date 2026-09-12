import { useNavigate } from "react-router-dom";
import { SearchIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";

export default function CategoriesScreen() {
  const navigate = useNavigate();
  const { categories, showToast } = useApp();

  return (
    <div className="flex flex-col pb-4 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">Categories</h1>
        <button
          onClick={() => navigate("/search")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 lg:hidden"
        >
          <SearchIcon width={17} height={17} />
        </button>
      </div>

      <div className="mt-3 px-4 lg:mt-5 lg:px-0">
        <button className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white lg:px-5 lg:py-2 lg:text-sm">
          All Categories
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 px-4 lg:mt-6 lg:grid-cols-4 lg:gap-4 lg:px-0">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/category/${c.id}`)}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white py-4 shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 lg:gap-3 lg:py-8"
          >
            <CategoryIcon categoryId={c.id} size={44} className="lg:scale-125" />
            <span className="px-1 text-center text-[11px] font-medium leading-tight text-gray-700 lg:text-[13px]">
              {c.name}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={() => showToast("Thanks! We'll notify you when it's available.")}
        className="mx-4 mt-5 rounded-2xl bg-brand-light px-4 py-3.5 text-left lg:mx-0 lg:mt-10 lg:px-8 lg:py-6"
      >
        <p className="text-[13px] font-semibold text-brand-dark lg:text-base">Can't find the service you need?</p>
        <p className="mt-0.5 text-[11px] text-brand-dark/70 lg:text-sm">Tell us, we'll add it for you.</p>
        <span className="mt-2.5 inline-block rounded-lg bg-brand px-3.5 py-2 text-[11px] font-semibold text-white lg:mt-3 lg:text-xs">
          Request a Service
        </span>
      </button>
      <CartBar />
    </div>
  );
}
