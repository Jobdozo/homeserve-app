// The Tikdum brand mark: a checkmark trailing into a location-pin drop —
// a service verified, delivered at a real address. White-stroke only, meant
// to sit inside an existing bg-brand badge (see Sidebar, LoginScreen).
export default function LogoMark({ size = 24, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M27 52 L43 68 L75 30" fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="43" y1="68" x2="43" y2="80" stroke="white" strokeWidth="7" strokeLinecap="round" />
      <circle cx="43" cy="83" r="3.6" fill="white" />
    </svg>
  );
}
