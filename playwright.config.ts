import { defineConfig, devices } from '@playwright/test'

/*
 * End-to-end checks run against the production build served by `vite preview` under the
 * GitHub Pages base path, because the service worker and manifest only exist in that build.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/app/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
    /*
     * WebKit is the engine behind every browser on iOS and iPadOS. It needs system libraries
     * (`npx playwright install --with-deps webkit`, which uses sudo), so it runs in CI and
     * locally only when PEPCALC_E2E_WEBKIT=1.
     */
    ...(process.env.CI || process.env.PEPCALC_E2E_WEBKIT
      ? [{ name: 'iphone', use: { ...devices['iPhone 15'] } }]
      : []),
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/app/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
