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

// The service worker serves the cached copy of the site on the first visit after a deploy;
// the new version installs in the background and takes over (skipWaiting + clientsClaim in
// sw.js) a few seconds later, while this tab is still running the old code. Reload onto the
// new version then: straight away if the page has only just opened, otherwise the next time
// the tab is hidden, so nobody loses what they're doing.
export function reloadOnNewVersion() {
  const sw = navigator.serviceWorker;
  if (!sw || !sw.controller) return; // first visit: nothing old is running
  const opened = Date.now();
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  sw.addEventListener("controllerchange", () => {
    if (Date.now() - opened < 15000 || document.visibilityState === "hidden") return reload();
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && reload());
  });
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
