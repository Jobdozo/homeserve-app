import CategoryIcon from "./CategoryIcon";

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

export default function CategoryPhoto({ categoryId, size = 96, rounded = "rounded-none", className = "" }) {
  const photo = PHOTOS[categoryId];
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover ${rounded} ${className}`}
      />
    );
  }
  return <CategoryIcon categoryId={categoryId} size={size} variant="vivid" fill rounded={rounded} className={className} />;
}
