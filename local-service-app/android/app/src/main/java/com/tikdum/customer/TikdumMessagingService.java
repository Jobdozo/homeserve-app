package com.tikdum.customer;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

// Handles incoming FCM messages natively so booking updates (accepted, on
// the way, completed, review reminders) reach the customer reliably even
// when the app is fully closed — matching why the provider app moved off
// Web Push, minus the full-screen ringing treatment providers need for a
// time-critical incoming job. A customer notification is informational, so
// a normal notification is the right level of urgency here.
public class TikdumMessagingService extends FirebaseMessagingService {

  private static final String CHANNEL_ID = "tikdum_customer_updates";
  public static final String EXTRA_BOOKING_ID = "bookingId";
  private static final AtomicInteger notificationId = new AtomicInteger(1000);

  @Override
  public void onNewToken(String token) {
    super.onNewToken(token);
    FcmTokenPlugin.notifyTokenListener(token);
  }

  @Override
  public void onMessageReceived(RemoteMessage message) {
    super.onMessageReceived(message);
    Map<String, String> data = message.getData();
    Log.e("TikdumFcm", "onMessageReceived data=" + data);
    if (data == null || data.isEmpty()) return;
    String title = data.containsKey("title") ? data.get("title") : "Tikdum";
    String body = data.containsKey("body") ? data.get("body") : "";
    showNotification(data.get("bookingId"), title, body);
  }

  private void showNotification(String bookingId, String title, String body) {
    Context ctx = getApplicationContext();
    ensureChannel(ctx);

    Intent intent = new Intent(ctx, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (bookingId != null) intent.putExtra(EXTRA_BOOKING_ID, bookingId);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent pendingIntent = PendingIntent.getActivity(ctx, notificationId.get(), intent, flags);

    NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent);

    NotificationManagerCompat.from(ctx).notify(notificationId.incrementAndGet(), builder.build());
  }

  private void ensureChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Booking updates", NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription("Updates about your service bookings");
    manager.createNotificationChannel(channel);
  }
}
