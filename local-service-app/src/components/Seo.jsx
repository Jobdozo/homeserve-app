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

export default function Seo({ title, description = DEFAULT_DESCRIPTION, path = "/", image = DEFAULT_IMAGE, jsonLd, noindex = false }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Book Trusted Home Services Near You`;
  const url = `${SITE_URL}${path}`;
  const jsonLdList = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

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

export { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, DEFAULT_IMAGE };
