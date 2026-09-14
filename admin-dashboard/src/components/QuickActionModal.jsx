import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { XIcon } from "./icons";

const TITLES = {
  category: "Add Category",
  provider: "Add Provider",
  service: "Add Service",
  banner: "Manage Banners",
  notification: "Send Notification",
  offer: "Manage Offers",
};

export default function QuickActionModal({ type, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-bold text-gray-900">{TITLES[type]}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        <div className="p-5">
          {type === "category" && <CategoryForm onDone={onClose} />}
          {type === "provider" && <ProviderForm onDone={onClose} />}
          {type === "service" && <ServiceForm onDone={onClose} />}
          {type === "notification" && <NotificationForm onDone={onClose} />}
          {type === "banner" && <BannerManager />}
          {type === "offer" && <OfferManager />}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const primaryBtnCls =
  "w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";

function CategoryForm({ onDone }) {
  const { addCategory, showToast } = useApp();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await addCategory({ name: name.trim(), icon: icon.trim() || undefined });
      onDone();
    } catch (err) {
      showToast(err.message || "Failed to add category");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className={labelCls}>Category name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Carpentry" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Icon (emoji, optional)</label>
        <input className={inputCls} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🔨" maxLength={4} />
      </div>
      <button type="submit" disabled={!name.trim() || busy} className={primaryBtnCls}>
        {busy ? "Adding…" : "Add Category"}
      </button>
    </form>
  );
}

function ProviderForm({ onDone }) {
  const { categories, addProvider, showToast } = useApp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || busy) return;
    setBusy(true);
    try {
      await addProvider({ name: name.trim(), phone: phone.trim(), category: category || undefined });
      onDone();
    } catch (err) {
      showToast(err.message || "Failed to add provider");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className={labelCls}>Provider name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Yadav" autoFocus />
      </div>
      <div>
        <label className={labelCls}>WhatsApp number</label>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        <p className="mt-1 text-[11px] text-gray-400">They'll log into the Provider App with this same number.</p>
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={!name.trim() || !phone.trim() || busy} className={primaryBtnCls}>
        {busy ? "Adding…" : "Add Provider"}
      </button>
    </form>
  );
}

function ServiceForm({ onDone }) {
  const { categories, providers, addService, showToast } = useApp();
  const [providerId, setProviderId] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = providerId && categorySlug && name.trim() && price;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await addService({
        providerId,
        categorySlug,
        name: name.trim(),
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
      });
      onDone();
    } catch (err) {
      showToast(err.message || "Failed to add service");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className={labelCls}>Provider</label>
        <select className={inputCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Select a provider</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <select className={inputCls} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Service name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fan Installation" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Price (₹)</label>
          <input className={inputCls} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="499" />
        </div>
        <div>
          <label className={labelCls}>Original price (optional)</label>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            placeholder="599"
          />
        </div>
      </div>
      <button type="submit" disabled={!valid || busy} className={primaryBtnCls}>
        {busy ? "Adding…" : "Add Service"}
      </button>
    </form>
  );
}

function NotificationForm({ onDone }) {
  const { sendBroadcastNotification, showToast } = useApp();
  const [audience, setAudience] = useState("customers");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || busy) return;
    setBusy(true);
    try {
      await sendBroadcastNotification({ audience, title: title.trim(), message: message.trim() });
      onDone();
    } catch (err) {
      showToast(err.message || "Failed to send notification");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className={labelCls}>Send to</label>
        <div className="flex gap-2">
          {[
            { value: "customers", label: "All Customers" },
            { value: "providers", label: "All Providers" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAudience(opt.value)}
              className={`flex-1 rounded-xl border py-2 text-[12.5px] font-semibold ${
                audience === opt.value ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Title</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Offer!" />
      </div>
      <div>
        <label className={labelCls}>Message</label>
        <textarea
          className={inputCls}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Get 20% off all AC services this weekend."
        />
      </div>
      <button type="submit" disabled={!title.trim() || !message.trim() || busy} className={primaryBtnCls}>
        {busy ? "Sending…" : "Send Notification"}
      </button>
    </form>
  );
}

function BannerManager() {
  const { showToast } = useApp();
  const [banners, setBanners] = useState(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [icon, setIcon] = useState("📣");
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listBanners().then(setBanners).catch(() => setBanners([]));
  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await api.createBanner({ title: title.trim(), subtitle: subtitle.trim(), icon });
      setTitle("");
      setSubtitle("");
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to add banner");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (b) => {
    await api.updateBanner(b.id, { active: !b.active });
    refresh();
  };

  const remove = async (b) => {
    await api.deleteBanner(b.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3.5 rounded-xl bg-gray-50 p-3.5">
        <div className="grid grid-cols-[56px_1fr] gap-2.5">
          <input className={inputCls} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Banner title" />
        </div>
        <input
          className={inputCls}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Subtitle (optional)"
        />
        <button type="submit" disabled={!title.trim() || busy} className={primaryBtnCls}>
          {busy ? "Adding…" : "Add Banner"}
        </button>
      </form>

      <div className="space-y-2">
        {banners === null && <p className="text-center text-[12px] text-gray-400">Loading…</p>}
        {banners?.length === 0 && <p className="text-center text-[12px] text-gray-400">No banners yet.</p>}
        {banners?.map((b) => (
          <div key={b.id} className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-2.5">
            <span className="text-lg">{b.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-gray-800">{b.title}</p>
              {b.subtitle && <p className="truncate text-[11px] text-gray-400">{b.subtitle}</p>}
            </div>
            <button
              onClick={() => toggleActive(b)}
              className={`rounded-full px-2 py-1 text-[10.5px] font-bold ${
                b.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
              }`}
            >
              {b.active !== false ? "Active" : "Hidden"}
            </button>
            <button onClick={() => remove(b)} className="text-gray-300 hover:text-red-500">
              <XIcon width={15} height={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferManager() {
  const { showToast } = useApp();
  const [offers, setOffers] = useState(null);
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listOffers().then(setOffers).catch(() => setOffers([]));
  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || !discountPercent || busy) return;
    setBusy(true);
    try {
      await api.createOffer({ code: code.trim(), discountPercent: Number(discountPercent), description: description.trim() });
      setCode("");
      setDiscountPercent("");
      setDescription("");
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to add offer");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (o) => {
    await api.updateOffer(o.id, { active: !o.active });
    refresh();
  };

  const remove = async (o) => {
    await api.deleteOffer(o.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3.5 rounded-xl bg-gray-50 p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <input
            className={inputCls + " uppercase"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE20"
          />
          <input
            className={inputCls}
            type="number"
            min="1"
            max="100"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="% off"
          />
        </div>
        <input
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        <button type="submit" disabled={!code.trim() || !discountPercent || busy} className={primaryBtnCls}>
          {busy ? "Adding…" : "Add Offer"}
        </button>
      </form>

      <div className="space-y-2">
        {offers === null && <p className="text-center text-[12px] text-gray-400">Loading…</p>}
        {offers?.length === 0 && <p className="text-center text-[12px] text-gray-400">No offers yet.</p>}
        {offers?.map((o) => (
          <div key={o.id} className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-gray-800">
                {o.code} — {o.discountPercent}% off
              </p>
              {o.description && <p className="truncate text-[11px] text-gray-400">{o.description}</p>}
            </div>
            <button
              onClick={() => toggleActive(o)}
              className={`rounded-full px-2 py-1 text-[10.5px] font-bold ${
                o.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
              }`}
            >
              {o.active !== false ? "Active" : "Hidden"}
            </button>
            <button onClick={() => remove(o)} className="text-gray-300 hover:text-red-500">
              <XIcon width={15} height={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
