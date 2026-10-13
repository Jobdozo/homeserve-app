import { useEffect, useState } from "react";
import { SERVER_URL } from "../api";
import CategoryIcon from "./CategoryIcon";
import { categoryIllustration } from "../utils/illustrations";

// Real branded photos for categories that have one (public/category-photos/) —
// falls back to the vivid CategoryIcon card for any category without a photo
// yet (e.g. "more-services"), so nothing breaks as new categories get added.
const PHOTOS = {
  "ac-repair": "/category-photos/ac-repair.jpg",
  electrician: "/category-photos/electrician.jpg",
  "appliance-repair": "/category-photos/appliance-repair.jpg",
  carpentry: "/category-photos/carpentry.jpg",
  "computer-repair": "/category-photos/computer-repair.jpg",
  "home-cleaning": "/category-photos/home-cleaning.jpg",
  "packers-movers": "/category-photos/packers-movers.jpg",
  painting: "/category-photos/painting.jpg",
  "pest-control": "/category-photos/pest-control.jpg",
  plumbing: "/category-photos/plumbing.jpg",
  "salon-spa": "/category-photos/salon-spa.jpg",
};

// The small "<name>-t.webp" copy the server keeps of every uploaded public photo,
// for cards and lists (a few times lighter than the photo itself).
const thumbOf = (url) => (/^\/uploads\/(?!p-)[\w.-]+\.(jpe?g|png|webp)$/i.test(url || "") && !/-t\.webp$/.test(url) ? url.replace(/\.[a-z0-9]+$/i, "-t.webp") : null);

// imageUrl = a photo the admin uploaded (a service's, or a category's tile photo); it
// wins over the built-in category picture. Small pictures (size ≤ 200) load its
// thumbnail; if that's missing the full photo is tried, then the built-in picture.
export default function CategoryPhoto({ categoryId, imageUrl, fallbackSrc, size = 96, rounded = "rounded-none", className = "" }) {
  const thumb = size <= 200 ? thumbOf(imageUrl) : null;
  const [stage, setStage] = useState(0); // 0 thumbnail (if any), 1 full photo, 2 built-in picture
  useEffect(() => setStage(0), [imageUrl]);
  const uploaded = !imageUrl || stage >= 2 ? null : stage === 0 && thumb ? thumb : imageUrl;
  const failed = () => setStage((s) => (s === 0 && thumb ? 1 : 2));
  // An uploaded picture wins; then a drawing for this particular type; then the category photo or drawing.
  const photo = uploaded ? `${SERVER_URL}${uploaded}` : fallbackSrc || PHOTOS[categoryId] || categoryIllustration(categoryId);
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        onError={uploaded ? failed : undefined}
        className={`h-full w-full object-cover ${rounded} ${className}`}
      />
    );
  }
  return <CategoryIcon categoryId={categoryId} size={size} variant="vivid" fill rounded={rounded} className={className} />;
}
