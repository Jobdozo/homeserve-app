import { useState } from "react";
import { SERVER_URL } from "../api";
import CategoryIcon from "./CategoryIcon";

// A picture from the first of these that exists and loads: the service's own
// photo, then its type's picture, then its category banner, and finally the
// plain category icon — so a card is never blank while pictures are still
// being added in Super Admin → Image Studio.
export default function Pic({ urls = [], categoryId, size = 56, rounded = "rounded-2xl", className = "" }) {
  const list = urls.filter(Boolean);
  const [bad, setBad] = useState(0);
  const url = list[bad];
  if (!url) return <CategoryIcon categoryId={categoryId} size={size} rounded={rounded} className={className} />;
  return (
    <img
      src={`${SERVER_URL}${url}`}
      alt=""
      loading="lazy"
      onError={() => setBad((n) => n + 1)}
      style={{ width: size, height: size }}
      className={`flex-shrink-0 object-cover ${rounded} ${className}`}
    />
  );
}
