import { SERVER_URL } from "../api";
import { useState } from "react";

// A provider's own photo or logo when they have uploaded one (it fills the
// round frame around it); otherwise the emoji they were given at sign-up.
export default function Avatar({ provider, fallback = "🙂" }) {
  const [failed, setFailed] = useState(false);
  if (provider?.photoUrl && !failed) {
    return <img src={`${SERVER_URL}${provider.photoUrl}`} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
  }
  return <>{provider?.avatar || fallback}</>;
}
