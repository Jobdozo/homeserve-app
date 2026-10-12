import { useCallback, useEffect, useRef, useState } from "react";

// A list the server hands out a page at a time (scaling step 5).
// fetchPage({ offset, limit }) resolves { items, total }. Changing `key` (a search
// word, a tab) starts over from the first page; loadMore() appends the next page.
export function usePagedList(fetchPage, key, { limit = 50 } = {}) {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const req = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(
    async (offset) => {
      const id = ++req.current;
      setLoading(true);
      setError("");
      try {
        const page = await fetchRef.current({ offset, limit });
        if (id !== req.current) return; // a newer search replaced this one
        setItems((prev) => (offset === 0 || !prev ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
      } catch (e) {
        if (id === req.current) setError(e.message || "Couldn't load the list");
      } finally {
        if (id === req.current) setLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    load(0);
  }, [key, load]);

  const loadMore = useCallback(() => load(items?.length || 0), [load, items]);
  const reload = useCallback(() => load(0), [load]);
  // Replace rows the app already knows changed (e.g. a live booking update).
  const patch = useCallback((fresh) => setItems((prev) => (prev ? prev.map((x) => fresh.find((f) => f.id === x.id) || x) : prev)), []);

  return { items, total, loading, error, loadMore, reload, patch, hasMore: items !== null && items.length < total };
}

// The value of `value` once it has stopped changing for `ms`.
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
