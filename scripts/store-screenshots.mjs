/*
 * Captures the phone screenshots for the F-Droid and Google Play listings from the Android
 * bundle (`vite build --mode android`, so no install hint or service worker), with the made-up
 * shelf in sample-backup.mjs restored through Settings. Run `npm run screenshots:store` after a
 * visible change; docs/releasing.md has the steps.
 *
 * The files are 1080 x 2400 PNGs (a 360 x 800 phone at 3x) named 1.png, 2.png, ... because the
 * stores order screenshots by file name.
 *
 * Usage: node scripts/store-screenshots.mjs [output dir]
 * The default output is fastlane/metadata/android/en-US/images/phoneScreenshots.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { sampleBackup } from './sample-backup.mjs'

const OUT = resolve(process.argv[2] ?? 'fastlane/metadata/android/en-US/images/phoneScreenshots')
const PORT = 4179
const VIEWPORT = { width: 360, height: 800 }
const SCALE = 3
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
      await scrollTo(page, page.getByText('3 · Dose'))
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
mkdirSync(OUT, { recursive: true })
for (const file of readdirSync(OUT)) if (file.endsWith('.png')) rmSync(join(OUT, file))

const server = await preview({ mode: 'android', preview: { port: PORT, strictPort: true } })
const browser = await chromium.launch()
try {
  for (const [index, shot] of SHOTS.entries()) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      isMobile: true,
      hasTouch: true,
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
    const file = join(OUT, `${index + 1}.png`)
    await page.screenshot({ path: file })
    console.log(`wrote ${file}`)
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise((done) => server.httpServer.close(done))
  rmSync(work, { recursive: true, force: true })
}
