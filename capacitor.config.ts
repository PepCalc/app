import type { CapacitorConfig } from '@capacitor/cli'

/*
 * The Android and iOS apps bundle the web build from `npm run build:android` or
 * `npm run build:ios` (base "/", no service worker); PEPCALC_PLATFORM picks which build a sync
 * copies. IndexedDB is scoped to the WebView origin, so the schemes and hostname are pinned:
 * changing any after release would strand every user's data. The appId is permanent once
 * published on Google Play and the App Store.
 */
const config: CapacitorConfig = {
  appId: 'io.github.pepcalc.app',
  appName: 'PepCalc',
  webDir: process.env.PEPCALC_PLATFORM === 'ios' ? 'dist-ios' : 'dist-android',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    hostname: 'localhost',
  },
  // Web debugging stays at Capacitor's default: on for debug builds only.
  android: {
    allowMixedContent: false,
  },
}

export default config
