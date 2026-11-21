import { computed, reactive } from 'vue'

/** Chrome's install event; not in the DOM typings because it is non-standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform =
  'ios-safari' | 'ios-chrome' | 'android-chrome' | 'android-firefox' | 'desktop' | 'other'

/**
 * Which set of install steps fits this device. Every iOS browser is WebKit with the same Share
 * menu, so only Chrome (CriOS) gets its own steps; Safari's suit the rest. On Android only
 * Firefox differs; Chrome's steps suit Edge, Samsung Internet and other Chromium browsers.
 */
export function detectPlatform(ua: string, maxTouchPoints: number): InstallPlatform {
  // iPadOS reports a desktop Mac user agent; touch support gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) {
    return /CriOS/.test(ua) ? 'ios-chrome' : 'ios-safari'
  }
  if (/Android/.test(ua)) return /Firefox/.test(ua) ? 'android-firefox' : 'android-chrome'
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop'
  return 'other'
}

/*
 * Chrome fires beforeinstallprompt once, soon after load, so one listener registered when this
 * module loads keeps the event for every caller: the banner and Settings, which loads later.
 */
const state = reactive({
  platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  // The Android app is already installed; its WebView reports display-mode "browser".
  standalone:
    __NATIVE__ ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
  deferred: null as BeforeInstallPromptEvent | null,
})

const canPrompt = computed(() => state.deferred !== null)

window.addEventListener('beforeinstallprompt', (event) => {
  // Hold Chrome's own install bar back; the banner offers the same prompt.
  event.preventDefault()
  state.deferred = event as BeforeInstallPromptEvent
})

window.addEventListener('appinstalled', () => {
  state.deferred = null
  state.standalone = true
})

/** Shows the browser's install dialog. The event is single use; Chrome may fire a fresh one later. */
async function promptInstall(): Promise<boolean> {
  const event = state.deferred
  if (!event) return false
  state.deferred = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

/**
 * Install state and the platform-appropriate way to add PepCalc to the home screen. Only
 * Chromium browsers offer a programmatic prompt; Safari and Firefox need instructions.
 */
export function useInstallPrompt() {
  return { state, canPrompt, actions: { promptInstall } }
}
