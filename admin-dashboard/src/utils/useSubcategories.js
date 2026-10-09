import { useEffect, useState } from "react";
import { api } from "../api";

// One shared list of sub-categories (admin sees inactive ones too). Every
// component that shows or edits them re-renders when any of them reloads it.
let cache = null;
const listeners = new Set();

export function reloadSubcategories() {
  return api.listSubcategories().then((rows) => {
    cache = rows;
    listeners.forEach((fn) => fn(rows));
    return rows;
  });
}

export default function useSubcategories() {
  const [subs, setSubs] = useState(cache || []);
  useEffect(() => {
    listeners.add(setSubs);
    if (cache) setSubs(cache);
    else reloadSubcategories().catch(() => {});
    return () => listeners.delete(setSubs);
  }, []);
  return subs;
}
