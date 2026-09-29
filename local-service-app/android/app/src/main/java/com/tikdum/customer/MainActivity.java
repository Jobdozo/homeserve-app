package com.tikdum.customer;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.util.function.Consumer;

public class MainActivity extends BridgeActivity {

  // Bypasses Capacitor's own @Permission/requestPermissionForAlias plumbing
  // (and @capacitor/push-notifications' requestPermissions()) for
  // POST_NOTIFICATIONS — confirmed live on-device, on the provider app using
  // the identical setup, that both of those can hang forever: no dialog, no
  // resolve, no reject, permanently, when called from a manually-registered
  // native plugin like FcmTokenPlugin. This uses the AndroidX Activity Result
  // API directly on the Activity instead, which was confirmed reliable there.
  private ActivityResultLauncher<String> notificationPermissionLauncher;
  private Consumer<Boolean> pendingNotificationPermissionCallback;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    notificationPermissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
      Log.e("TikdumFcm", "notificationPermissionLauncher result: " + granted);
      if (pendingNotificationPermissionCallback != null) {
        pendingNotificationPermissionCallback.accept(granted);
        pendingNotificationPermissionCallback = null;
      }
    });
    Log.e("TikdumFcm", "MainActivity.onCreate — registering FcmTokenPlugin");
    registerPlugin(FcmTokenPlugin.class);
    super.onCreate(savedInstanceState);
    handleNotificationIntent(getIntent());
  }

  // Called from FcmTokenPlugin.requestNotificationPermission — see the
  // field comment above for why this exists instead of going through
  // Capacitor's own permission system.
  void requestNotificationPermission(Consumer<Boolean> callback) {
    pendingNotificationPermissionCallback = callback;
    notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS);
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    handleNotificationIntent(intent);
  }

  private void handleNotificationIntent(Intent intent) {
    if (intent == null) return;
    String bookingId = intent.getStringExtra(TikdumMessagingService.EXTRA_BOOKING_ID);
    if (bookingId == null) return;
    FcmTokenPlugin.notifyNotificationTap(bookingId);
  }
}
