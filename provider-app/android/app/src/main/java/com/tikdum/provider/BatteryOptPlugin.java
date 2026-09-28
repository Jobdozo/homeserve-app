package com.tikdum.provider;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Vivo/Xiaomi/Oppo/Huawei and a few others kill a "closed" app's process and
// block its push notifications unless the user explicitly exempts it —
// confirmed necessary via live device testing: a new-job FCM message never
// arrived while this app was closed on a Vivo phone, even after adding it to
// Android's OWN Doze whitelist. Two separate levers, since OEMs gate them
// independently:
//  1. The standard Android "ignore battery optimizations" exemption — the
//     official, Play-Store-compliant API for an app with a genuine need to
//     wake up for a time-critical event (same category as calling/messaging
//     apps).
//  2. A best-effort deep link into the OEM's own "autostart"/background app
//     manager. There's no public API for this at all — the component names
//     below are the same ones the community-run "Don't kill my app" project
//     documents. Each is tried in turn; unrecognized OEMs/versions simply
//     fall through with nothing happening (never a crash).
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptPlugin extends Plugin {

  @PluginMethod
  public void isIgnoringBatteryOptimizations(PluginCall call) {
    Context ctx = getContext();
    boolean ignoring = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
      ignoring = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
    JSObject result = new JSObject();
    result.put("ignoring", ignoring);
    result.put("manufacturer", Build.MANUFACTURER);
    call.resolve(result);
  }

  @PluginMethod
  public void requestIgnoreBatteryOptimizations(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      call.resolve();
      return;
    }
    try {
      Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
      intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      Log.e("TikdumFcm", "requestIgnoreBatteryOptimizations failed", e);
      call.reject("Could not open battery settings", e);
    }
  }

  @PluginMethod
  public void openAutostartSettings(PluginCall call) {
    Context ctx = getContext();
    String[][] candidates = {
      // Vivo / iQOO
      { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
      { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
      { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManagerActivity" },
      // Xiaomi / Redmi / POCO
      { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
      // Oppo / Realme
      { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
      { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
      { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
      // Huawei / Honor
      { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
      // Letv, Asus, Samsung (closest equivalent screens)
      { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
      { "com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity" },
      { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
    };
    for (String[] c : candidates) {
      try {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(c[0], c[1]));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
        return;
      } catch (Exception ignored) {
        // Not this device/OEM/version — try the next one.
      }
    }
    JSObject result = new JSObject();
    result.put("opened", false);
    call.resolve(result);
  }
}
