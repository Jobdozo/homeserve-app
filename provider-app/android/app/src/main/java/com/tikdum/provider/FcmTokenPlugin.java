package com.tikdum.provider;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

// A minimal custom bridge instead of @capacitor/push-notifications' own
// token API — that plugin also wires up its own default notification
// display, which would compete with TikdumMessagingService's full-screen
// ringing notification. This just exposes the FCM registration token to JS.
@CapacitorPlugin(name = "FcmToken")
public class FcmTokenPlugin extends Plugin {

  private static FcmTokenPlugin activeInstance;
  // Covers the cold-start race: MainActivity.onCreate can run and forward a
  // ring intent before the WebView has finished loading the app's JS and
  // attached its listener. JS reads this once on startup as a fallback for
  // whatever the live "ring" event missed.
  private static String pendingRingBookingId;

  @Override
  public void load() {
    super.load();
    activeInstance = this;
    Log.e("TikdumFcm", "FcmTokenPlugin loaded");
  }

  @PluginMethod
  public void getToken(PluginCall call) {
    Log.e("TikdumFcm", "getToken() called from JS");
    FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
      if (!task.isSuccessful() || task.getResult() == null) {
        Log.e("TikdumFcm", "getToken failed", task.getException());
        call.reject("Could not get FCM token", task.getException());
        return;
      }
      Log.e("TikdumFcm", "getToken success: " + task.getResult());
      JSObject result = new JSObject();
      result.put("token", task.getResult());
      call.resolve(result);
    });
  }

  @PluginMethod
  public void consumePendingRing(PluginCall call) {
    JSObject result = new JSObject();
    result.put("bookingId", pendingRingBookingId);
    call.resolve(result);
    pendingRingBookingId = null;
  }

  // Called from TikdumMessagingService.onNewToken — relays a refreshed
  // token to JS the same way a foreground app would want to re-save it.
  static void notifyTokenListener(String token) {
    if (activeInstance == null) return;
    JSObject data = new JSObject();
    data.put("token", token);
    activeInstance.notifyListeners("tokenRefresh", data);
  }

  // Called from MainActivity when launched/resumed via the ringing
  // notification's full-screen intent.
  static void notifyRingListener(String bookingId) {
    pendingRingBookingId = bookingId;
    if (activeInstance == null) return;
    JSObject data = new JSObject();
    data.put("bookingId", bookingId);
    activeInstance.notifyListeners("ring", data);
  }
}
