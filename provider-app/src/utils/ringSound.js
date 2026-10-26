// Tells the Android app which sound a booking request rings with while the app is closed
// (RingSoundPlugin.java): the Tikdum tune or the phone's ringtone. In a browser it does nothing —
// there the request rings only while the page is open (utils/ringtone.js).
import { Capacitor, registerPlugin } from "@capacitor/core";

const RingSound = registerPlugin("RingSound");

export async function syncRingSound(sound) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RingSound.setRingSound({ sound: sound === "phone" ? "phone" : "tikdum" });
  } catch {
    // an app build without the plugin: it keeps ringing with the phone's ringtone
  }
}
