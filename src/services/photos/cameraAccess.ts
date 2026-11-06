/**
 * Whether PepCalc may use the camera, for Take a photo. In a browser the file input hands off to
 * the system camera with no permission of its own, so the web build is always "unsupported" and
 * never loads the native plugin.
 */
export type CameraAccess = 'granted' | 'denied' | 'prompt' | 'unsupported'

const native = () => import('./nativeCamera')

/** Unsupported if the plugin fails, so Take a photo still opens the input. */
export async function checkCameraAccess(): Promise<CameraAccess> {
  if (!__NATIVE__) return 'unsupported'
  try {
    return await (await native()).checkAccess()
  } catch {
    return 'unsupported'
  }
}

/** Records that the system is about to ask. Never throws: this only refines a later check. */
export async function markCameraAsked(): Promise<void> {
  if (!__NATIVE__) return
  try {
    await (await native()).markAsked()
  } catch {
    // A later check then reads "prompt" and asks again, which is harmless.
  }
}

/** Opens PepCalc's page in the phone's settings; false if that could not be done. */
export async function openCameraSettings(): Promise<boolean> {
  if (!__NATIVE__) return false
  try {
    await (await native()).openSettings()
    return true
  } catch {
    return false
  }
}
