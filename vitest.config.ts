import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { vuetifyRipplePatch } from './build/vuetify-ripple-patch.ts'

export default defineConfig({
  plugins: [vuetifyRipplePatch(), vue(), vuetify({ autoImport: true })],
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __NATIVE__: 'false',
    __SITE_URL__: JSON.stringify('https://pepcalc.github.io/'),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.spec.ts'],
    css: true,
    setupFiles: ['tests/setup.ts'],
    server: { deps: { inline: ['vuetify'] } },
  },
})
