import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getBatteryOptimizationStatus } from "./batteryOptimization";

// Whether this phone can show job alerts: "granted" | "denied" | "prompt" | "unknown".
// Reading the permission never asks for it, and a hung native call gives up after 2s.
async function notificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const result = await Promise.race([PushNotifications.checkPermissions(), new Promise((r) => setTimeout(() => r(null), 2000))]);
      return result?.receive || "unknown";
    } catch {
      return "unknown";
    }
  }
  if (typeof Notification === "undefined") return "unknown";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

// Everything that can stop a new job from ringing on this phone, checked again
// whenever the app comes back to the front (e.g. from system settings).
export function usePhoneReadiness() {
  const [state, setState] = useState({ checked: false, notifications: "unknown", battery: true, manufacturer: "" });
  const check = useCallback(async () => {
    const [notifications, battery] = await Promise.all([
      notificationPermission(),
      getBatteryOptimizationStatus().catch(() => ({ ignoring: true, manufacturer: "" })),
    ]);
    setState({ checked: true, notifications, battery: battery.ignoring !== false, manufacturer: battery.manufacturer || "" });
  }, []);
  useEffect(() => {
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);
  return { ...state, recheck: check };
}

// The first thing worth fixing, for the nudge on Orders (null = all good).
export function firstPhoneProblem(r) {
  if (!r.checked) return null;
  if (r.notifications === "denied") return "Notifications are off — you won't hear new jobs";
  if (!r.battery) return "Battery saver may silence job alerts";
  return null;
}
