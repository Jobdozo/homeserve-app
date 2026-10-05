import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { API_BASE } from "../api";
import LogoMark from "./LogoMark";

const APP_KEY = "admin";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.tikdum.admin";

// Blocks the whole app behind an "Update required" screen when this Android
// build is older than the minimum Super Admin has set. Fails open: if the
// check can't reach the server (offline, slow 2G) nobody is locked out.
export default function UpdateGate({ children }) {
  const [block, setBlock] = useState(null);

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const info = await CapApp.getInfo();
      const installed = parseInt(info.build, 10);
      const res = await fetch(`${API_BASE}/app-version?app=${APP_KEY}`, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) return;
      const { minVersionCode, message } = await res.json();
      setBlock(Number.isFinite(installed) && minVersionCode > installed ? { message } : null);
    } catch (e) {
      // keep whatever we knew before
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    check();
    if (!Capacitor.isNativePlatform()) return undefined;
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) check();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, [check]);

  if (!block) return children;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-white px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white">
        <LogoMark size={34} />
      </span>
      <div>
        <h1 className="text-[20px] font-extrabold text-gray-900">Update required</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-relaxed text-gray-500">
          {block.message || "A new version of Tikdum Admin is available. Please update to keep managing the platform."}
        </p>
      </div>
      <a
        href={PLAY_URL}
        target="_blank"
        rel="noreferrer"
        className="w-full max-w-xs rounded-xl bg-brand py-3.5 text-[14px] font-bold text-white shadow-card active:scale-[0.98]"
      >
        Update now
      </a>
      <button onClick={check} className="text-[12.5px] font-semibold text-gray-400">
        I've updated — check again
      </button>
    </div>
  );
}
