package io.github.pepcalc.app;

import android.icu.util.LocaleData;
import android.icu.util.ULocale;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/** Reports the device's format region and measurement system for default display units. */
@CapacitorPlugin(name = "RegionalPreferences")
public class RegionalPreferencesPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        Locale locale = Locale.getDefault(Locale.Category.FORMAT);
        JSObject result = new JSObject();
        result.put("region", locale.getCountry());
        String system = measurementSystem(locale);
        if (system != null) result.put("measurementSystem", system);
        call.resolve(result);
    }

    // LocaleData.getMeasurementSystem arrived in API 28; the app supports 26.
    private static String measurementSystem(Locale locale) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null;
        LocaleData.MeasurementSystem system = LocaleData.getMeasurementSystem(ULocale.forLocale(locale));
        if (system == LocaleData.MeasurementSystem.US) return "us";
        if (system == LocaleData.MeasurementSystem.UK) return "uk";
        return "metric";
    }
}
