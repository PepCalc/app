import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { vuetifyRipplePatch } from './build/vuetify-ripple-patch.ts'

export default defineConfig({
  plugins: [vuetifyRipplePatch(), vue(), vuetify({ autoImport: true })],
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __NATIVE__: 'false',
    __PLATFORM__: JSON.stringify('web'),
    __SITE_URL__: JSON.stringify('https://pepcalc.github.io/'),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    css: true,
    setupFiles: ['tests/setup.ts'],
    server: { deps: { inline: ['vuetify'] } },
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          include: ['tests/**/*.spec.ts'],
          exclude: [...configDefaults.exclude, 'tests/native/**'],
        },
      },
      {
        extends: true,
        define: { __NATIVE__: 'true', __PLATFORM__: JSON.stringify('android') },
        test: { name: 'native', include: ['tests/native/**/*.spec.ts'] },
      },
    ],
  },
})
