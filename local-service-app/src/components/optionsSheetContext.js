import { createContext, useCallback, useContext } from "react";
import { useApp } from "../context/AppContext";

// Shared by the options sheet and every ADD button (kept apart from both to avoid an import loop).
export const SheetContext = createContext({ open: () => {} });
export const useOptionsSheet = () => useContext(SheetContext);

// Adds a service, or opens its options sheet when it has choices to make.
export function useAddService() {
  const { addToCart } = useApp();
  const { open } = useOptionsSheet();
  return useCallback(
    (service, likeServiceId) => (service?.options?.length ? open(service, likeServiceId) : addToCart(service.id, likeServiceId)),
    [addToCart, open]
  );
}
