import { Component } from "react";

// A screen's code file failing to load usually means the app was just updated
// and the browser still holds the old cached files. Clearing the cache and
// reloading fixes it.
const LOAD_ERROR = /dynamically imported module|Loading chunk|Loading CSS chunk|Importing a module script failed|error loading dynamically/i;
const RECOVERED_KEY = "tikdum-auto-recovered";

async function clearCachesAndReload(hash) {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch (e) {
    console.error("cache clear failed", e);
  }
  if (hash) window.location.hash = hash;
  window.location.reload();
}

// Catches a crash in any screen so the app shows a way out instead of a blank
// white page: reload, or go back to the start.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed", error, info?.componentStack);
    // One automatic recovery attempt per session for stale-cache load failures.
    try {
      if (LOAD_ERROR.test(String(error?.message || error)) && !sessionStorage.getItem(RECOVERED_KEY)) {
        sessionStorage.setItem(RECOVERED_KEY, "1");
        clearCachesAndReload();
      }
    } catch (e) {
      console.error("auto recovery failed", e);
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: "#5b5b6e", margin: 0, maxWidth: 300 }}>This screen hit a problem. Reloading usually fixes it.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => clearCachesAndReload()} style={{ background: "#5B3FE0", color: "#fff", border: 0, borderRadius: 12, padding: "10px 18px", fontWeight: 600, fontSize: 14 }}>
            Reload
          </button>
          <button onClick={() => clearCachesAndReload("#/")} style={{ background: "#fff", color: "#5b5b6e", border: "1px solid #ddd", borderRadius: 12, padding: "10px 18px", fontWeight: 600, fontSize: 14 }}>
            Go to start
          </button>
        </div>
      </div>
    );
  }
}
