package com.tikdum.provider;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Which sound a new booking request rings with while the app is closed — the
// Tikdum tune (res/raw/tikdum_request) or the phone's own ringtone. Chosen in
// Notification Settings → Ring sound (web layer: utils/notificationPrefs.js);
// TikdumMessagingService reads it when a request arrives, since the closed app
// has no web layer to ask.
@CapacitorPlugin(name = "RingSound")
public class RingSoundPlugin extends Plugin {
  static final String PREFS = "tikdum_ring";
  static final String KEY = "sound";
  static final String TUNE = "tikdum";
  static final String PHONE = "phone";

  static String current(Context ctx) {
    return PHONE.equals(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, TUNE)) ? PHONE : TUNE;
  }

  @PluginMethod
  public void setRingSound(PluginCall call) {
    String sound = PHONE.equals(call.getString("sound")) ? PHONE : TUNE;
    getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, sound).apply();
    JSObject out = new JSObject();
    out.put("sound", sound);
    call.resolve(out);
  }
}
