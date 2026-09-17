package com.tikdum.customer;

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
    handleNotificationIntent(getIntent());
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
