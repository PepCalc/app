/*
 * Draws the two brand images, so their tag lines live in code rather than in a hand-edited file:
 * the link preview for the site (og.png, 1200 x 630) and the store feature graphic
 * (featureGraphic.png, 1024 x 500). Run `make brand-images` after a change to the tag lines or
 * the phone screenshots.
 *
 * The store graphic says nothing about price: Google Play asks that feature graphics avoid words
 * like "Free". It also carries no medicine brand names.
 *
 * Usage: node scripts/brand-images.mjs
 * The link preview goes to the site's sibling checkout, pepcalc.github.io.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const NAME = 'PepCalc'
const OG = {
  file: '../pepcalc.github.io/site/assets/og.png',
  stem: "The peptide tracker that's",
  drum: 'always free',
  line: 'No paywalls. No subscriptions.',
}
const STORE = {
  file: 'fastlane/metadata/android/en-US/images/featureGraphic.png',
  title: 'Your data. On your device.',
  line: 'Not our server. Not our cloud.',
}
const SHOTS = 'fastlane/metadata/android/en-US/images/phoneScreenshots'
// Screens with no medicine brand name in view.
const OG_SHOT = `${SHOTS}/5.png`
const STORE_SHOT = `${SHOTS}/1.png`
const FONTS = '../pepcalc.github.io/site/fonts'
const COLOR = { brand: '#4f7f62', strong: '#2b4a39', light: '#77c798' }

const dataUri = (file, type) =>
  `data:${type};base64,${readFileSync(resolve(file)).toString('base64')}`
const fontFace = (weight) => `@font-face {
  font-family: 'Hanken Grotesk';
  font-weight: ${weight};
  src: url('${dataUri(`${FONTS}/hanken-grotesk-latin-${weight}-normal.woff2`, 'font/woff2')}');
}`
const logo = dataUri('branding/logo.svg', 'image/svg+xml')
const ogShot = dataUri(OG_SHOT, 'image/png')
const storeShot = dataUri(STORE_SHOT, 'image/png')
const base = `${[400, 600, 700].map(fontFace).join('\n')}
* { box-sizing: border-box; margin: 0; }
body { font-family: 'Hanken Grotesk', sans-serif; overflow: hidden; position: relative; }
.brand { display: flex; align-items: center; font-weight: 700; letter-spacing: -0.03em; }
.brand img { border-radius: 22%; }
.phone { position: absolute; overflow: hidden; display: block; }`

const ogHtml = `<style>${base}
body {
  width: 1200px; height: 630px; padding: 84px 0 0 72px; color: #1d1a14;
  background:
    radial-gradient(760px 460px at 0% 0%, rgba(116, 179, 174, 0.26), transparent 70%),
    radial-gradient(640px 400px at 100% 0%, rgba(220, 141, 107, 0.18), transparent 70%), #fbf8f3;
}
.brand { gap: 16px; font-size: 40px; }
.brand img { width: 60px; height: 60px; }
h1 {
  width: 740px;
  margin-top: 44px;
  font-size: 62px; line-height: 1.04; letter-spacing: -0.035em;
  font-weight: 700;
}
.drum {
  position: relative; display: inline-block; margin-top: 12px; padding: 0 22px; height: 86px;
  line-height: 86px; border-radius: 14px; overflow: hidden; background: #15120e;
  color: ${COLOR.light}; font-size: 64px; font-weight: 700; letter-spacing: -0.035em;
}
.drum::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(rgba(0, 0, 0, 0.6), transparent 14%, transparent 86%, rgba(0, 0, 0, 0.6));
}
p { margin-top: 26px; font-size: 30px; font-weight: 600; color: #5f5544; letter-spacing: -0.01em; }
.phone {
  right: 64px; top: 56px; width: 320px; border-radius: 34px 34px 0 0;
  border: 1px solid #e8ddcc; border-bottom: 0; box-shadow: 0 18px 50px rgba(45, 38, 26, 0.18);
}
.phone img { display: block; width: 100%; }
</style>
<div class="brand"><img src="${logo}" alt="" /><span>${NAME}</span></div>
<h1>${OG.stem}</h1>
<div class="drum">${OG.drum}</div>
<p>${OG.line}</p>
<div class="phone"><img src="${ogShot}" alt="" /></div>`

const storeHtml = `<style>${base}
body {
  width: 1024px; height: 500px; padding: 104px 0 0 72px; color: #fbf8f3;
  background: linear-gradient(135deg, ${COLOR.brand}, ${COLOR.strong});
}
.brand { gap: 20px; font-size: 68px; }
.brand img { width: 84px; height: 84px; }
h1 { margin-top: 36px; font-size: 46px; line-height: 1.08; letter-spacing: -0.03em; font-weight: 700; width: 560px; }
p { margin-top: 14px; font-size: 26px; font-weight: 400; color: rgba(251, 248, 243, 0.86); }
.phone {
  right: 96px; top: 40px; width: 250px; height: 560px; border: 9px solid #12201b;
  border-radius: 34px; transform: rotate(-4deg); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
.phone img { display: block; width: 100%; }
</style>
<div class="brand"><img src="${logo}" alt="" /><span>${NAME}</span></div>
<h1>${STORE.title}</h1>
<p>${STORE.line}</p>
<div class="phone"><img src="${storeShot}" alt="" /></div>`

const browser = await chromium.launch()
try {
  for (const [html, width, height, file] of [
    [ogHtml, 1200, 630, OG.file],
    [storeHtml, 1024, 500, STORE.file],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: resolve(file) })
    console.log(`wrote ${file}`)
    await page.close()
  }
} finally {
  await browser.close()
}
