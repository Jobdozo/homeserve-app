import CategoryIcon from "./CategoryIcon";
import { SERVER_URL } from "../api";

// The vivid CategoryIcon card is the fallback for every service — this swaps
// in the generated brand-ambassador photo (service.heroImage) once Gemini has
// produced one, without changing any of the layout/sizing callers already use.
export default function ServiceCardMedia({ service, size = 96, rounded = "rounded-none", className = "" }) {
  if (service.heroImage) {
    return (
      <img
        src={`${SERVER_URL}${service.heroImage}`}
        alt={service.name}
        className={`h-full w-full object-cover ${rounded} ${className}`}
      />
    );
  }
  return <CategoryIcon categoryId={service.categoryId} size={size} variant="vivid" fill rounded={rounded} className={className} />;
}
