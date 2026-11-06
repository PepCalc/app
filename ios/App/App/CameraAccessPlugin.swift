import AVFoundation
import Capacitor
import UIKit

/// Reports whether PepCalc may use the camera, so the page can explain before the system dialog
/// and offer Settings after a refusal. The dialog itself comes from iOS when the page opens its
/// capture input, using NSCameraUsageDescription.
@objc(CameraAccessPlugin)
public class CameraAccessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CameraAccessPlugin"
    public let jsName = "CameraAccess"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markAsked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    @objc func check(_ call: CAPPluginCall) {
        let state: String
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            state = "granted"
        case .notDetermined:
            state = "prompt"
        default:
            state = "denied"
        }
        call.resolve(["state": state])
    }

    /// iOS tracks this itself; Android needs the page to say so.
    @objc func markAsked(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Could not open settings")
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open settings")
                }
            }
        }
    }
}
