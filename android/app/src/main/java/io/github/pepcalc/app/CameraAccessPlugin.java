package io.github.pepcalc.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports whether PepCalc may use the camera, so the page can explain before the system dialog
 * and offer Settings after a refusal. The dialog itself comes from Capacitor when the page opens
 * its capture input: a file input only opens during a tap, and a tap does not outlive a system
 * dialog, so requesting here first would leave the camera unable to open.
 *
 * Android cannot tell "never asked" from "refused for good": both report no rationale. Only a
 * remembered first ask separates them.
 */
@CapacitorPlugin(name = "CameraAccess")
public class CameraAccessPlugin extends Plugin {

    private static final String PREFERENCES = "CameraAccess";
    private static final String ASKED = "asked";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void check(PluginCall call) {
        String state;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            state = "granted";
        } else if (
            !preferences().getBoolean(ASKED, false) ||
            ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), Manifest.permission.CAMERA)
        ) {
            state = "prompt";
        } else {
            state = "denied";
        }
        JSObject result = new JSObject();
        result.put("state", state);
        call.resolve(result);
    }

    @PluginMethod
    public void markAsked(PluginCall call) {
        preferences().edit().putBoolean(ASKED, true).apply();
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }
}
