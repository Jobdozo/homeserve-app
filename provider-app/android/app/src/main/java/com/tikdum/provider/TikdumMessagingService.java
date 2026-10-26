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
import java.util.concurrent.atomic.AtomicInteger;

// Handles incoming FCM messages natively instead of leaning on the OS's
// default auto-display — that path only ever produces a plain, DND-respecting
// notification. A "new booking request" needs the same urgency as an
// incoming call: full-screen on the lock screen, ringtone-loud, and able to
// get through Do Not Disturb the way a phone call can. None of that is
// reachable from a Web Push service worker, which is the whole reason this
// app moved from a Trusted Web Activity to a native shell.
public class TikdumMessagingService extends FirebaseMessagingService {

  private static final String CHANNEL_ID = "tikdum_booking_requests";
  // The same requests with the Tikdum tune (res/raw/tikdum_request, a cut of
  // "Rising Horizon") — the default; CHANNEL_ID above keeps the phone's own
  // ringtone for providers who choose it (RingSoundPlugin). Two channels
  // because Android fixes a channel's sound when it's created.
  private static final String TUNE_CHANNEL_ID = "tikdum_booking_requests_tune";
  // Everything else (announcements from Admin, approvals, reviews, payouts):
  // a normal notification. The server also sends these with a notification
  // block on this channel, so Android shows them itself while the app is in
  // the background; this code covers the app being open.
  public static final String UPDATES_CHANNEL_ID = "tikdum_updates";
  private static final AtomicInteger updateId = new AtomicInteger(2000);
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
    if (data == null || data.isEmpty()) return;
    // Only a genuinely new incoming request rings like a call — other
    // provider notifications (reviews, etc.) also carry a bookingId but
    // aren't a 90-second-timer "accept or decline" event.
    if (!"booking:created".equals(data.get("type"))) {
      String title = data.get("title");
      if (title != null && !title.isEmpty()) showUpdateNotification(data.get("bookingId"), title, data.containsKey("body") ? data.get("body") : "");
      return;
    }
    String bookingId = data.get("bookingId");
    if (bookingId == null || bookingId.isEmpty()) return;
    String title = data.containsKey("title") ? data.get("title") : "New booking request";
    String body = data.containsKey("body") ? data.get("body") : "";

    showRingingNotification(bookingId, title, body);
  }

  private void showRingingNotification(String bookingId, String title, String body) {
    Log.e("TikdumFcm", "showRingingNotification bookingId=" + bookingId);
    Context ctx = getApplicationContext();
    boolean tune = RingSoundPlugin.TUNE.equals(RingSoundPlugin.current(ctx));
    if (tune) ensureTuneChannel(ctx);
    else ensureChannel(ctx);

    Intent fullScreenIntent = new Intent(ctx, MainActivity.class);
    fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    fullScreenIntent.putExtra(EXTRA_BOOKING_ID, bookingId);
    fullScreenIntent.putExtra(EXTRA_RING, true);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(ctx, bookingId != null ? bookingId.hashCode() : 0, fullScreenIntent, flags);

    NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, tune ? TUNE_CHANNEL_ID : CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_tikdum)
        // The small icon is just a white silhouette (Android's own rule for
        // status-bar icons); without an explicit color, OEM notification
        // shades that tint or badge it (MIUI, etc.) fall back to a generic
        // blue instead of the Tikdum brand purple.
        .setColor(0xFF634AE0)
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

  private void showUpdateNotification(String bookingId, String title, String body) {
    Context ctx = getApplicationContext();
    ensureUpdatesChannel(ctx);
    Intent intent = new Intent(ctx, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    int id = updateId.incrementAndGet();
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent pendingIntent = PendingIntent.getActivity(ctx, id, intent, flags);
    NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, UPDATES_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_tikdum)
        .setColor(0xFF634AE0)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent);
    NotificationManagerCompat.from(ctx).notify(id, builder.build());
  }

  // Also called from MainActivity.onCreate, so the channel exists before the
  // first background notification arrives (Android then uses it, not "Miscellaneous").
  static void ensureUpdatesChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager.getNotificationChannel(UPDATES_CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(UPDATES_CHANNEL_ID, "Updates and announcements", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Messages from Tikdum, approvals, reviews and payouts");
    channel.enableVibration(true);
    manager.createNotificationChannel(channel);
  }

  private void ensureTuneChannel(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager.getNotificationChannel(TUNE_CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(TUNE_CHANNEL_ID, "Booking requests (Tikdum tune)", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("New booking requests that need an immediate response, with the Tikdum tune");
    channel.enableVibration(true);
    channel.setVibrationPattern(new long[] { 0, 400, 200, 400, 200, 400 });
    channel.setBypassDnd(true);
    Uri tuneUri = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.tikdum_request);
    channel.setSound(tuneUri, new android.media.AudioAttributes.Builder()
        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build());
    manager.createNotificationChannel(channel);
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
