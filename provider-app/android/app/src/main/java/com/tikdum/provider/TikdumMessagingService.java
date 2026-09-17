package com.tikdum.provider;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

// Handles incoming FCM messages natively instead of leaning on the OS's
// default auto-display — that path only ever produces a plain, DND-respecting
// notification. A "new booking request" needs the same urgency as an
// incoming call: full-screen on the lock screen, ringtone-loud, and able to
// get through Do Not Disturb the way a phone call can. None of that is
// reachable from a Web Push service worker, which is the whole reason this
// app moved from a Trusted Web Activity to a native shell.
public class TikdumMessagingService extends FirebaseMessagingService {

  private static final String CHANNEL_ID = "tikdum_booking_requests";
  public static final String EXTRA_BOOKING_ID = "bookingId";
  public static final String EXTRA_RING = "ring";

  @Override
  public void onNewToken(String token) {
    super.onNewToken(token);
    // The web layer (utils/pushNotifications.js) reads this via the
    // FcmToken bridge plugin and POSTs it to the server — see fcmBridge.js.
    FcmTokenPlugin.notifyTokenListener(token);
  }

  @Override
  public void onMessageReceived(RemoteMessage message) {
    super.onMessageReceived(message);
    Map<String, String> data = message.getData();
    Log.e("TikdumFcm", "onMessageReceived data=" + data);
    // Only a genuinely new incoming request rings like a call — other
    // provider notifications (reviews, etc.) also carry a bookingId but
    // aren't a 90-second-timer "accept or decline" event.
    if (data == null || !"booking:created".equals(data.get("type"))) return;
    String bookingId = data.get("bookingId");
    if (bookingId == null || bookingId.isEmpty()) return;
    String title = data.containsKey("title") ? data.get("title") : "New booking request";
    String body = data.containsKey("body") ? data.get("body") : "";

    showRingingNotification(bookingId, title, body);
  }

  private void showRingingNotification(String bookingId, String title, String body) {
    Log.e("TikdumFcm", "showRingingNotification bookingId=" + bookingId);
    Context ctx = getApplicationContext();
    ensureChannel(ctx);

    Intent fullScreenIntent = new Intent(ctx, MainActivity.class);
    fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    fullScreenIntent.putExtra(EXTRA_BOOKING_ID, bookingId);
    fullScreenIntent.putExtra(EXTRA_RING, true);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(ctx, bookingId != null ? bookingId.hashCode() : 0, fullScreenIntent, flags);

    NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setOngoing(true)
        .setFullScreenIntent(fullScreenPendingIntent, true)
        .setContentIntent(fullScreenPendingIntent);

    NotificationManagerCompat.from(ctx).notify(bookingId != null ? bookingId.hashCode() : 1, builder.build());
  }

  private void ensureChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return;

    // A brand-new channel ID on purpose — an earlier, differently-named
    // channel got created silent during troubleshooting before this feature
    // existed, and Android locks a channel's sound/vibration at creation
    // time. Reusing that old channel would inherit the silence.
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Booking requests", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("New booking requests that need an immediate response");
    channel.enableVibration(true);
    channel.setVibrationPattern(new long[] { 0, 400, 200, 400, 200, 400 });
    channel.setBypassDnd(true);
    Uri ringtoneUri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE);
    if (ringtoneUri != null) {
      channel.setSound(ringtoneUri, new android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build());
    }
    manager.createNotificationChannel(channel);
  }
}
