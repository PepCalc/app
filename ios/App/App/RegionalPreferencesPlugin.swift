import Capacitor
import Foundation

/// Reports the device's region and measurement system for default display units.
@objc(RegionalPreferencesPlugin)
public class RegionalPreferencesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RegionalPreferencesPlugin"
    public let jsName = "RegionalPreferences"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        let locale = Locale.current
        // Locale.measurementSystem arrived in iOS 16; the app supports 15.
        if #available(iOS 16, *) {
            let system: String
            switch locale.measurementSystem {
            case .us: system = "us"
            case .uk: system = "uk"
            default: system = "metric"
            }
            call.resolve(["region": locale.region?.identifier ?? "", "measurementSystem": system])
        } else {
            call.resolve([
                "region": locale.regionCode ?? "",
                "measurementSystem": locale.usesMetricSystem ? "metric" : "us",
            ])
        }
    }
}
