/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string

/** True in the Capacitor (Android and iOS) builds, false in the web build. Set by vite.config.ts. */
declare const __NATIVE__: boolean
/** Which build this is. Set by vite.config.ts. */
declare const __PLATFORM__: 'web' | 'android' | 'ios'

/** The public site, for links printed on share images. Set by vite.config.ts. */
declare const __SITE_URL__: string
