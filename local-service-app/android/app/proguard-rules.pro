# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- R8 keep rules for this app's own native bridge code ---
# Capacitor finds a plugin's class (registerPlugin) and calls its
# @PluginMethod-annotated methods by name via reflection from JS — R8's
# normal renaming/removal of unused members would silently break those
# calls at runtime without ever failing the build. FirebaseMessagingService
# and the launcher Activity are found by class name from AndroidManifest.xml
# the same way. Keeping this app's whole package is simplest and safe: it's
# three small classes, not where the app's size or perf comes from.
-keep class com.tikdum.customer.** { *; }
-keep public class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService
