/*
 * Captures the screenshots for the F-Droid and Google Play listings from the Android bundle
 * (`vite build --mode android`, so no install hint or service worker), with the made-up shelf
 * in sample-backup.mjs restored through Settings. Run `npm run screenshots:store` after a visible
 * change; docs/releasing.md has the steps.
 *
 * Each device writes PNGs named 1.png, 2.png, ... into its folder under IMAGES, because the
 * stores order screenshots by file name. Tablet and Chromebook sizes are 16:9 or 9:16 with
 * every side at least 1080px, which Play needs to feature an app on large screens.
 *
 * Usage: node scripts/store-screenshots.mjs [device ...]
 * Devices: phone, sevenInch, tenInch, chromebook. With none, all are taken.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { sampleBackup } from './sample-backup.mjs'

const IMAGES = 'fastlane/metadata/android/en-US/images'
const PORT = 4179

/** Viewports in CSS pixels; the files are `scale` times larger. */
const DEVICES = {
  // 1080 x 2400
  phone: { dir: 'phoneScreenshots', viewport: { width: 360, height: 800 }, scale: 3, mobile: true },
  // 1216 x 2160, a 7-inch tablet held upright
  sevenInch: {
    dir: 'sevenInchScreenshots',
    viewport: { width: 608, height: 1080 },
    scale: 2,
    mobile: true,
  },
  // 2560 x 1440, a 10-inch tablet held sideways (the wide layout)
  tenInch: {
    dir: 'tenInchScreenshots',
    viewport: { width: 1280, height: 720 },
    scale: 2,
    mobile: true,
  },
  // 3200 x 1800, a Chromebook window; Play takes these by upload only (fastlane has no folder)
  chromebook: {
    dir: 'chromebookScreenshots',
    viewport: { width: 1600, height: 900 },
    scale: 2,
    mobile: false,
  },
}

const names = process.argv.slice(2)
for (const name of names) if (!DEVICES[name]) throw new Error(`Unknown device: ${name}`)
const devices = (names.length ? names : Object.keys(DEVICES)).map((name) => DEVICES[name])
// The margin above a section scrolled to the top (the app bar scrolls away with the page).
const MARGIN = 16

/** Scrolls the page so `locator` sits near the top. */
async function scrollTo(page, locator) {
  await locator.first().evaluate((el, offset) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset)
  }, MARGIN)
}

async function openTab(page, name) {
  await page.getByRole('link', { name, exact: true }).first().click()
  await page.evaluate(() => window.scrollTo(0, 0))
}

/** In order: each opens a screen and waits for what makes it worth showing. */
const SHOTS = [
  {
    scheme: 'light',
    show: async (page) => {
      await openTab(page, 'Calculator')
      await page.getByText('1 · Peptide').waitFor()
    },
  },
  {
    scheme: 'light',
    show: async (page) => {
      await openTab(page, 'Calculator')
      // A dose that lands on a syringe mark from the default vial (5 mg in 3 mL): 30 units.
      await page
        .getByRole('group', { name: 'Dose' })
        .getByRole('button', { name: '0.5 mg', exact: true })
        .click()
      await page.getByTestId('draw-headline').filter({ hasText: '30' }).waitFor()
      // The wide layout (840px and up) shows the draw beside the inputs, so it returns to the top
      // the click scrolled away from; phones scroll down to the dose instead.
      if (page.viewportSize().width < 840) await scrollTo(page, page.getByText('3 · Dose'))
      else await page.evaluate(() => window.scrollTo(0, 0))
    },
  },
  {
    scheme: 'light',
    show: async (page) => {
      await openTab(page, 'Shelf')
      await page.getByText('BPC-157').first().waitFor()
    },
  },
  {
    scheme: 'light',
    show: async (page) => {
      await openTab(page, 'Shelf')
      await page.getByText('Semaglutide').first().click()
      await page.getByText('Remaining').waitFor()
    },
  },
  {
    scheme: 'light',
    show: async (page) => {
      await openTab(page, 'Protocols')
      await page.getByText('Estimated levels').first().waitFor()
    },
  },
  {
    scheme: 'dark',
    show: async (page) => {
      await openTab(page, 'Journal')
      await page.getByText('Weight', { exact: true }).first().waitFor()
    },
  },
]

const work = mkdtempSync(join(tmpdir(), 'pepcalc-store-shots-'))
const backupPath = join(work, 'sample-backup.json')
writeFileSync(backupPath, JSON.stringify(sampleBackup()))

const server = await preview({ mode: 'android', preview: { port: PORT, strictPort: true } })
const browser = await chromium.launch()
try {
  for (const device of devices) {
    const out = resolve(IMAGES, device.dir)
    mkdirSync(out, { recursive: true })
    for (const file of readdirSync(out)) if (file.endsWith('.png')) rmSync(join(out, file))
    for (const [index, shot] of SHOTS.entries()) {
      await capture(device, shot, join(out, `${index + 1}.png`))
    }
  }
} finally {
  await browser.close()
  await new Promise((done) => server.httpServer.close(done))
  rmSync(work, { recursive: true, force: true })
}

async function capture(device, shot, file) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    colorScheme: shot.scheme,
    locale: 'en-US',
    reducedMotion: 'reduce',
    // Lets the shot hide notifications with a style tag under the app's CSP.
    bypassCSP: true,
  })
  const page = await context.newPage()
  await page.goto(`http://localhost:${PORT}/`)
  await page.getByRole('button', { name: /or older and understand/ }).click()
  await openTab(page, 'Settings')
  await page.getByLabel('Backup file').setInputFiles(backupPath)
  await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click()
  await page.getByText('Backup restored').waitFor()
  await page.addStyleTag({ content: '.v-snackbar { display: none !important; }' })
  await shot.show(page)
  // Fonts and the charts' first paint settle after the content is in the tree.
  await page.waitForTimeout(1500)
  await page.screenshot({ path: file })
  console.log(`wrote ${file}`)
  await context.close()
}
