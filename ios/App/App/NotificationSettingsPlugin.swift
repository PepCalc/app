import Capacitor
import UIKit

/// Opens PepCalc's notification settings, so a user who turned notifications off can turn them
/// back on in one tap from the reminder screen. iOS 16 has a URL for the notification page
/// itself; before that, the app's page in Settings, which lists Notifications.
@objc(NotificationSettingsPlugin)
public class NotificationSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationSettingsPlugin"
    public let jsName = "NotificationSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let address: String
            if #available(iOS 16.0, *) {
                address = UIApplication.openNotificationSettingsURLString
            } else {
                address = UIApplication.openSettingsURLString
            }
            guard let url = URL(string: address) else {
                call.reject("Could not open notification settings")
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open notification settings")
                }
            }
        }
    }
}
