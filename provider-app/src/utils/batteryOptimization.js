import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridges to BatteryOptPlugin.java — confirmed necessary via live device
// testing: a new-job push never arrived while this app was closed on a Vivo
// phone, even after Android's own Doze whitelist. See that file for why this
// needs two separate OS-level exemptions, not just one.
const BatteryOptimization = registerPlugin("BatteryOptimization");

// { ignoring: boolean, manufacturer: string } — "ignoring" true means the app
// is already exempt (or this isn't a native build), so there's nothing to fix.
export async function getBatteryOptimizationStatus() {
  if (!Capacitor.isNativePlatform()) return { ignoring: true, manufacturer: "" };
  try {
    return await BatteryOptimization.isIgnoringBatteryOptimizations();
  } catch (e) {
    console.error("Battery optimization check failed", e);
    return { ignoring: true, manufacturer: "" };
  }
}

// Opens Android's own system dialog asking to exempt this app.
export async function requestBatteryExemption() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await BatteryOptimization.requestIgnoreBatteryOptimizations();
  } catch (e) {
    console.error("Requesting battery exemption failed", e);
  }
}

// Best-effort: opens the OEM's own autostart/background app manager, if this
// device has one Tikdum recognizes. Resolves { opened: boolean } — false just
// means this OEM/version isn't in the lookup table, not an error.
export async function openAutostartSettings() {
  if (!Capacitor.isNativePlatform()) return { opened: false };
  try {
    return await BatteryOptimization.openAutostartSettings();
  } catch (e) {
    console.error("Opening autostart settings failed", e);
    return { opened: false };
  }
}
