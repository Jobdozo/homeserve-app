import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ProviderDetailModal from "../components/ProviderDetailModal";

// Providers Verification → a provider: everything about them on one full-screen page, with
// their services as tick boxes. "Back to providers" returns to the cards (search and tab kept).
export default function ProviderPage() {
  const { providerId } = useParams();
  const navigate = useNavigate();
  const { providers } = useApp();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/providers"));

  if (!providers.some((p) => p.id === providerId)) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-card">
        <p className="text-sm text-gray-500">{providers.length ? "This provider wasn't found." : "Loading…"}</p>
        <button onClick={() => navigate("/providers")} className="mt-3 text-sm font-semibold text-brand">
          ← Back to providers
        </button>
      </div>
    );
  }
  return <ProviderDetailModal providerId={providerId} onClose={back} asPage />;
}
