import { registerPlugin } from '@capacitor/core'

export type NativeCameraAccess = 'granted' | 'denied' | 'prompt'

/** The app's own plugin: CameraAccessPlugin.java on Android, .swift on iOS. */
const CameraAccess = registerPlugin<{
  check(): Promise<{ state: NativeCameraAccess }>
  markAsked(): Promise<void>
  openSettings(): Promise<void>
}>('CameraAccess')

export async function checkAccess(): Promise<NativeCameraAccess> {
  return (await CameraAccess.check()).state
}

export async function markAsked(): Promise<void> {
  await CameraAccess.markAsked()
}

export async function openSettings(): Promise<void> {
  await CameraAccess.openSettings()
}
