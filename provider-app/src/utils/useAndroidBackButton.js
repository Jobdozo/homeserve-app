import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

const EXIT_WINDOW_MS = 2000;

// The login/loading screens render outside the app's normal layouts (which
// own the in-app toast), so this draws its own so the hint shows everywhere.
function showExitHint() {
  document.getElementById("exit-hint-toast")?.remove();
  const el = document.createElement("div");
  el.id = "exit-hint-toast";
  el.textContent = "Double press to exit";
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "84px",
    transform: "translateX(-50%)",
    background: "rgba(17,24,39,0.92)",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
    zIndex: "9999",
    pointerEvents: "none",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), EXIT_WINDOW_MS - 200);
}

// Android hardware/gesture back: on any inner screen it goes back one screen
// (or to the home screen if there's nowhere to go back to). On the home
// screen — or before login — the first press shows "Double press to exit"
// and a second press within two seconds closes the app.
export function useAndroidBackButton({ rootPath, atRoot }) {
  const navigate = useNavigate();
  const latest = useRef({ atRoot, rootPath, navigate });
  latest.current = { atRoot, rootPath, navigate };

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return undefined;
    let lastPress = 0;
    let handle;
    let cancelled = false;
    CapApp.addListener("backButton", () => {
      const { atRoot: root, rootPath: home, navigate: go } = latest.current;
      if (!root) {
        if (window.history.length > 1) go(-1);
        else go(home, { replace: true });
        return;
      }
      const now = Date.now();
      if (now - lastPress < EXIT_WINDOW_MS) {
        CapApp.exitApp();
        return;
      }
      lastPress = now;
      showExitHint();
    }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);
}
