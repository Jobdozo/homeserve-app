import { useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)"; // Tailwind's `lg`

// True on desktop-width screens. The desktop-only pages mount only when this
// is true, so phones never render (or crash on) them.
export default function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
