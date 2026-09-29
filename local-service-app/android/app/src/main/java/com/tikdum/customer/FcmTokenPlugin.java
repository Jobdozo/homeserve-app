package com.tikdum.customer;

import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

// A minimal custom bridge instead of @capacitor/push-notifications' own
// token API — matches the provider app's plugin so the JS side can share
// the same registration pattern. Just exposes the FCM token to JS.
@CapacitorPlugin(name = "FcmToken")
public class FcmTokenPlugin extends Plugin {

  private static FcmTokenPlugin activeInstance;
  // Covers the cold-start race: MainActivity.onCreate can run and forward a
  // tapped-notification's bookingId before the WebView has finished loading
  // the app's JS and attached its listener. JS reads this once on startup
  // as a fallback for whatever the live "notificationTap" event missed.
  private static String pendingBookingId;

  @Override
  public void load() {
    super.load();
    activeInstance = this;
    Log.e("TikdumFcm", "FcmTokenPlugin loaded");
  }

  @PluginMethod
  public void consumePendingNotification(PluginCall call) {
    JSObject result = new JSObject();
    result.put("bookingId", pendingBookingId);
    call.resolve(result);
    pendingBookingId = null;
  }

  // Called from MainActivity when launched/resumed via a tapped notification.
  static void notifyNotificationTap(String bookingId) {
    pendingBookingId = bookingId;
    if (activeInstance == null) return;
    JSObject data = new JSObject();
    data.put("bookingId", bookingId);
    activeInstance.notifyListeners("notificationTap", data);
  }

  // Android 13+ (API 33/Tiramisu) is the first version where notifications
  // are a runtime permission at all — older versions have nothing to ask for.
  // Goes through MainActivity's own AndroidX Activity Result launcher rather
  // than Capacitor's @Permission/requestPermissionForAlias or
  // @capacitor/push-notifications' requestPermissions() — confirmed live
  // on-device (on the provider app's identical setup) that both of those
  // never settle at all when called from a manually-registered plugin like
  // this one: no dialog, no resolve, no reject, permanently.
  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      call.resolve();
      return;
    }
    ((MainActivity) getActivity()).requestNotificationPermission(granted -> {
      JSObject result = new JSObject();
      result.put("granted", granted);
      call.resolve(result);
    });
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

  // Called from TikdumMessagingService.onNewToken — relays a refreshed
  // token to JS the same way a foreground app would want to re-save it.
  static void notifyTokenListener(String token) {
    if (activeInstance == null) return;
    JSObject data = new JSObject();
    data.put("token", token);
    activeInstance.notifyListeners("tokenRefresh", data);
  }
}
