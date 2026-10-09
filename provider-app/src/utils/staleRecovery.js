// After a deploy, a tab that was already open still points at the old,
// now-deleted script files, so the next screen it opens fails to load. Clearing
// the service worker and caches and reloading picks up the new version.
//
// Guarded by time (not once-per-session): several deploys in one day are
// normal, but two recoveries within two minutes means something else is wrong,
// so we stop and let the error screen show instead of reloading in a loop.
const AT_KEY = "tikdum-auto-recovered-at";
const MIN_GAP_MS = 2 * 60 * 1000;

export async function clearCachesAndReload(path) {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch (e) {
    console.error("cache clear failed", e);
  }
  if (path) {
    window.location.href = path;
  } else {
    window.location.reload();
  }
}

// Returns true if a recovery reload was started.
export function recoverFromStaleFiles() {
  try {
    const last = Number(sessionStorage.getItem(AT_KEY) || 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    sessionStorage.setItem(AT_KEY, String(Date.now()));
    clearCachesAndReload();
    return true;
  } catch (e) {
    console.error("auto recovery failed", e);
    return false;
  }
}
