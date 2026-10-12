import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

// A service a screen needs that the first catalogue load may not hold (a shared
// link, a service past the first page of its category) is fetched — only if it's
// offered at the customer's PIN. `full`: every field (highlights, all "included"
// lines), for the service's own page. `looking` stays true until we know.
export function useCatalogService(serviceId, { full = false } = {}) {
  const { getService, ensureService, catalogReady } = useApp();
  const service = getService(serviceId);
  const needs = !service || (full && service.lite);
  const [looked, setLooked] = useState(null);
  useEffect(() => {
    if (!catalogReady || !needs) return;
    let alive = true;
    Promise.resolve(ensureService(serviceId, { full })).finally(() => alive && setLooked(serviceId));
    return () => {
      alive = false;
    };
  }, [serviceId, catalogReady, needs, full, ensureService]);
  return { service, looking: !service && (!catalogReady || looked !== serviceId) };
}

// Same for a provider (their page, or a past booking's provider).
export function useCatalogProvider(providerId) {
  const { getProvider, ensureProvider, catalogReady } = useApp();
  const provider = getProvider(providerId);
  const [looked, setLooked] = useState(null);
  useEffect(() => {
    if (!catalogReady || provider) return;
    let alive = true;
    Promise.resolve(ensureProvider(providerId)).finally(() => alive && setLooked(providerId));
    return () => {
      alive = false;
    };
  }, [providerId, catalogReady, provider, ensureProvider]);
  return { provider, looking: !provider && (!catalogReady || looked !== providerId) };
}

export function CatalogLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-10" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
    </div>
  );
}
