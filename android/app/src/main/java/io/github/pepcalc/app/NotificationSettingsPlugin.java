package io.github.pepcalc.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens PepCalc's notification settings, so a user who turned notifications off can turn them
 * back on in one tap from the reminder screen. Before Android 8 there is no per-app notification
 * screen, so it opens the app's details page instead.
 */
@CapacitorPlugin(name = "NotificationSettings")
public class NotificationSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification settings", e);
        }
    }
}
