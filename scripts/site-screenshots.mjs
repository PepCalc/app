/*
 * Captures the phone screenshots for the website (pepcalc.github.io) from the production build:
 * the draw result, the Protocols tab and the shelf. Run `npm run screenshots:site` after a change
 * to any of them.
 *
 * The data is the made-up shelf in sample-backup.mjs, restored through Settings, so the shot
 * shows exactly what restored data renders as. The draw is entered in the calculator, as a user
 * would, so its numbers match the site's alt text: 0.25 mg from 2 mg in 3 mL is 37.5 units.
 *
 * Usage: node scripts/site-screenshots.mjs [output dir]
 * The default output is ../pepcalc.github.io/site/assets/screens, the site's sibling checkout.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { preview } from 'vite'
import { sampleBackup } from './sample-backup.mjs'

const OUT = resolve(process.argv[2] ?? '../pepcalc.github.io/site/assets/screens')
const PORT = 4176

// The site's phone frames are 540 x 1200: a 360 x 800 phone at 1.5x.
const VIEWPORT = { width: 360, height: 800 }
const SCALE = 1.5
const SIZE = { width: 540, height: 1200 }
// The margin above a section scrolled to the top (the app bar scrolls away with the page).
const MARGIN = 8

const choose = (page, group, value) =>
  page.getByRole('group', { name: group }).getByRole('button', { name: value, exact: true }).click()

async function openTab(page, name) {
  await page.getByRole('link', { name, exact: true }).first().click()
  await page.evaluate(() => window.scrollTo(0, 0))
}

/** Each opens a screen and waits for what makes it worth showing. */
const SHOTS = [
  {
    name: 'draw',
    show: async (page) => {
      await openTab(page, 'Calculator')
      await choose(page, 'Peptide in vial', 'Custom')
      await page.getByLabel('Peptide in vial').last().fill('2')
      await choose(page, 'Bacteriostatic water added', 'Custom')
      await page.getByLabel('Bacteriostatic water added').last().fill('3')
      await choose(page, 'Dose', '0.25 mg')
      await page.getByTestId('draw-headline').filter({ hasText: '37.5' }).waitFor()
      await page
        .getByText('3 · Dose')
        .first()
        .evaluate((el, offset) => {
          const card = el.closest('.v-card') ?? el
          window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - offset)
        }, MARGIN)
    },
  },
  {
    name: 'levels',
    show: async (page) => {
      await openTab(page, 'Protocols')
      await page
        .getByText(/^Next dose /)
        .first()
        .waitFor()
    },
  },
  {
    name: 'shelf',
    show: async (page) => {
      await openTab(page, 'Shelf')
      await page.getByText('BPC-157').first().waitFor()
    },
  },
]

const work = mkdtempSync(join(tmpdir(), 'pepcalc-site-shots-'))
const backupPath = join(work, 'sample-backup.json')
writeFileSync(backupPath, JSON.stringify(sampleBackup()))
mkdirSync(OUT, { recursive: true })

const server = await preview({ preview: { port: PORT, strictPort: true } })
const browser = await chromium.launch()
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      locale: 'en-US',
      reducedMotion: 'reduce',
      // Lets the shot hide notifications with a style tag under the app's CSP.
      bypassCSP: true,
    })
    const page = await context.newPage()
    await page.goto(`http://localhost:${PORT}/app/`)
    await page.getByRole('button', { name: /or older and understand/ }).click()
    await openTab(page, 'Settings')
    await page.getByLabel('Backup file').setInputFiles(backupPath)
    await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click()
    await page.getByText('Backup restored').waitFor()
    await page.addStyleTag({
      content: '.v-snackbar, .v-banner { display: none !important; }',
    })
    await shot.show(page)
    // Fonts and the charts' first paint settle after the content is in the tree.
    await page.waitForTimeout(1500)
    const png = await page.screenshot()
    const file = join(OUT, `${shot.name}.webp`)
    await sharp(png).resize(SIZE.width, SIZE.height).webp({ quality: 82 }).toFile(file)
    console.log(`wrote ${file}`)
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise((done) => server.httpServer.close(done))
  rmSync(work, { recursive: true, force: true })
}
