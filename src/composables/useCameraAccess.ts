import { onBeforeUnmount, onMounted, reactive } from 'vue'
import {
  checkCameraAccess,
  markCameraAsked,
  openCameraSettings,
  type CameraAccess,
} from '@/services/photos/cameraAccess'

/**
 * Take a photo, following the permission the way the platforms recommend: explain first, ask only
 * when the user chooses to, and point to Settings after a refusal.
 *
 * `capture` opens the file input, which browsers allow only during a tap, and a tap does not
 * survive a round trip to native code or a system dialog. So access is checked ahead of time,
 * `takePhoto` and `allow` call `capture` directly, and the system dialog comes from opening the
 * input. `settle` runs when the input closes and reads how that went.
 */
export function useCameraAccess(capture: () => void) {
  const state = reactive({
    // A native tap before the first check lands on the explanation, never on an unexplained ask.
    access: (__NATIVE__ ? 'prompt' : 'unsupported') as CameraAccess,
    explaining: false,
  })
  let asked = false

  async function refresh() {
    state.access = await checkCameraAccess()
    if (state.access === 'granted') state.explaining = false
  }

  function takePhoto() {
    if (state.access === 'granted' || state.access === 'unsupported') capture()
    else state.explaining = true
  }

  function allow() {
    asked = true
    state.explaining = false
    void markCameraAsked()
    capture()
  }

  /** A refusal the system will not ask about again goes straight to the way out. */
  async function settle() {
    await refresh()
    if (asked && state.access === 'denied') state.explaining = true
    asked = false
  }

  // Returning from the phone's settings shows the app again; that is when access may have changed.
  function onVisible() {
    if (document.visibilityState === 'visible') void refresh()
  }
  onMounted(() => {
    void refresh()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

  return { state, actions: { takePhoto, allow, settle, openSettings: openCameraSettings } }
}
