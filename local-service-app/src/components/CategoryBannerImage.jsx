import { useState } from "react";
import { SERVER_URL } from "../api";
import CategoryPhoto from "./CategoryPhoto";

// Wide banner picture for a category/service page. Uses the banner the admin
// uploaded for the category (Super Admin → Services & Categories → Edit
// category); without one — or if it fails to load — falls back to the
// service/category picture, as before.
export default function CategoryBannerImage({ category, categoryId, imageUrl, size = 240, fallbackClassName = "" }) {
  const [failed, setFailed] = useState(false);
  if (category?.bannerUrl && !failed) {
    return (
      <img
        src={`${SERVER_URL}${category.bannerUrl}`}
        alt=""
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-center"
      />
    );
  }
  return <CategoryPhoto categoryId={categoryId} imageUrl={imageUrl} size={size} className={fallbackClassName} />;
}
