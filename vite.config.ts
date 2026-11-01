import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'
import { vuetifyRipplePatch } from './build/vuetify-ripple-patch.ts'
import { catalogPeptides, seo } from './build/seo.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/*
 * The app is served from the `app` repository of the PepCalc organisation on GitHub Pages
 * (https://pepcalc.github.io/app/); the website (PepCalc/pepcalc.github.io) owns the root of
 * that origin. PEPCALC_BASE overrides it. Always starts and ends with "/".
 */
function webBase(): string {
  return normalizeBase(process.env.PEPCALC_BASE ?? '/app/')
}

/*
 * The website's root, printed on share cards. PEPCALC_SITE_URL overrides it, e.g. for a custom
 * domain. The app's own address (canonical and Open Graph tags) is this plus the base path.
 */
function siteUrl(): string {
  return (process.env.PEPCALC_SITE_URL || 'https://pepcalc.github.io/').replace(/\/?$/, '/')
}

function appUrl(): string {
  return siteUrl() + webBase().slice(1)
}

function normalizeBase(value: string): string {
  const trimmed = value.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

/*
 * GitHub Pages cannot send response headers, so the Content-Security-Policy ships as a meta
 * tag. It is added only to the production build: the dev server injects inline HMR helpers.
 * 'unsafe-inline' for styles is required because Vuetify writes its theme into a <style> tag.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'pepcalc-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

/*
 * `vite build --mode android` and `--mode ios` build the Capacitor bundles: served from the
 * app's own origin at "/", with no service worker (the app already holds every asset, and a
 * worker would keep serving the previous version's files after an update). Each writes to its
 * own directory so it never mixes with the Pages build or the other platform.
 */
export default defineConfig(({ command, mode }) => {
  const platform = mode === 'android' || mode === 'ios' ? mode : 'web'
  const native = platform !== 'web'
  const base = native ? '/' : webBase()
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __NATIVE__: JSON.stringify(native),
      __PLATFORM__: JSON.stringify(platform),
      __SITE_URL__: JSON.stringify(siteUrl()),
    },
    plugins: [
      vuetifyRipplePatch({ required: command === 'build' }),
      vue(),
      vuetify({ autoImport: true }),
      contentSecurityPolicy(),
      seo({
        enabled: !native,
        appUrl: appUrl(),
        version: pkg.version,
        peptides: catalogPeptides(
          fileURLToPath(new URL('./src/data/peptides.json', import.meta.url)),
        ),
      }),
      VitePWA({
        disable: native,
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png', 'layers.css'],
        manifest: {
          id: base,
          name: 'PepCalc: Peptide Calculator',
          short_name: 'PepCalc',
          description:
            'Private, offline peptide reconstitution and draw calculator. All data stays on this device.',
          lang: 'en',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#fbf8f3',
          theme_color: '#3f6b52',
          categories: ['medical', 'utilities'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,webmanifest}'],
          // The share image is for link previews only; installs need not download it.
          globIgnores: ['og.png'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // ECharts is one large chunk; it must be precached for the PK chart to work offline.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    optimizeDeps: {
      // The dev server pre-bundles Vuetify, which bypasses the plugins above.
      rolldownOptions: { plugins: [vuetifyRipplePatch()] },
      // Vuetify 4: keep overlay modules in one pre-bundle so nested overlays stack in dev.
      include: [
        'vuetify/components/VOverlay',
        'vuetify/components/VDialog',
        'vuetify/components/VMenu',
        'vuetify/components/VSelect',
        'vuetify/components/VTooltip',
      ],
    },
    build: {
      target: 'es2022',
      outDir: native ? `dist-${platform}` : 'dist',
      chunkSizeWarningLimit: 900,
    },
  }
})
