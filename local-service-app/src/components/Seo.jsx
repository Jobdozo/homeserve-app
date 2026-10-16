import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

// Centralizes meta tags so every public (unauthenticated-browsable) screen
// gets a real title/description instead of the one static "Tikdum" title
// that used to apply to every route — search engines and link-preview bots
// (WhatsApp, etc.) need per-page content to show anything useful.
const SITE_NAME = "Tikdum";
const SITE_URL = "https://tikdum.com";
const DEFAULT_DESCRIPTION =
  "Book trusted home services near you on Tikdum — cleaning, pest control, AC repair, and more. Compare verified local providers and book instantly over WhatsApp.";
const DEFAULT_IMAGE = `${SITE_URL}/pwa-512.png`;

const absoluteUrl = (u) => (!u ? DEFAULT_IMAGE : /^https?:\/\//.test(u) ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`);

export default function Seo({ title, description = DEFAULT_DESCRIPTION, path = "/", image, jsonLd, noindex = false }) {
  image = absoluteUrl(image);
  // The page arrived with its head filled in by the server (server/src/seoPages.js): those
  // tags go once this takes over, and its structured data stays while this is still the page
  // it was written for (it's richer than the copy below, so that one isn't added twice).
  useEffect(() => {
    document.querySelectorAll("[data-static-seo]").forEach((el) => el.remove());
    document.querySelectorAll("script[data-seo-path]").forEach((el) => {
      if (el.getAttribute("data-seo-path") !== path) el.remove();
    });
  }, [path]);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Book Trusted Home Services Near You`;
  const url = `${SITE_URL}${path}`;
  const fromServer = typeof document !== "undefined" && [...document.querySelectorAll("script[data-seo-path]")].some((el) => el.getAttribute("data-seo-path") === path);
  const jsonLdList = jsonLd && !fromServer ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLdList.map((item, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}

// A service page's search description from its real details (same wording as the server's,
// server/src/seoPages.js serviceDescription): the service, starting price, who does it, where,
// and the provider's own note when it says more than the name.
export function serviceDescription(s, providerName) {
  const name = String(s.name || "").trim();
  const note = String(s.tagline || "").trim().replace(/[.\s]+$/, "");
  const useful = note && !name.toLowerCase().startsWith(note.toLowerCase()) && note.toLowerCase() !== name.toLowerCase();
  const price = Number(s.price) > 0 ? ` from ₹${Number(s.price).toLocaleString("en-IN")}` : "";
  const text = `${name}${price}${providerName ? ` with ${providerName}` : ""} in Jammu & Kashmir.${useful ? ` ${note}.` : ""} Verified local professionals — book instantly on Tikdum over WhatsApp.`;
  return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text;
}

export { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, DEFAULT_IMAGE };
