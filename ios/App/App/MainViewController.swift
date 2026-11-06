import Capacitor
import UIKit

/// The app's web view. Registers PepCalc's own plugins, which are not npm packages, so
/// Capacitor would not find them on its own (Main.storyboard names this class).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CameraAccessPlugin())
    }
}
