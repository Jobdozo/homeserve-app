package com.tikdum.provider;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.util.function.Consumer;

public class MainActivity extends BridgeActivity {

  // Bypasses Capacitor's own @Permission/requestPermissionForAlias plumbing
  // for POST_NOTIFICATIONS — confirmed live on-device that it (and
  // @capacitor/push-notifications' equivalent) never settles at all when
  // called from a manually-registered native plugin like FcmTokenPlugin:
  // no dialog, no resolve, no reject, permanently. This uses the same
  // AndroidX Activity Result API Google recommends generally, registered
  // directly on the Activity rather than routed through Capacitor's plugin
  // permission bridge, and has been confirmed reliable independent of
  // whatever that bridge's issue turns out to be.
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
    registerPlugin(BatteryOptPlugin.class);
    super.onCreate(savedInstanceState);
    handleRingIntent(getIntent());
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
    handleRingIntent(intent);
  }

  // Tapping (or the OS auto-launching, for a full-screen intent) the
  // ringing notification brings the app here with these extras — forward
  // them to JS so it can pull up the same RingingOverlay the live socket
  // path uses, instead of just opening to whatever screen was last shown.
  private void handleRingIntent(Intent intent) {
    if (intent == null || !intent.getBooleanExtra(TikdumMessagingService.EXTRA_RING, false)) return;
    String bookingId = intent.getStringExtra(TikdumMessagingService.EXTRA_BOOKING_ID);
    if (bookingId == null) return;
    FcmTokenPlugin.notifyRingListener(bookingId);
  }
}
