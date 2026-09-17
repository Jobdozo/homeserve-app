package com.tikdum.provider;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    Log.e("TikdumFcm", "MainActivity.onCreate — registering FcmTokenPlugin");
    registerPlugin(FcmTokenPlugin.class);
    super.onCreate(savedInstanceState);
    handleRingIntent(getIntent());
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
