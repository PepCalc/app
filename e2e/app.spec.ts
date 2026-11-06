import { expect, test, type Page } from '@playwright/test'
import { acceptDisclaimer, choose } from './helpers'

/**
 * The first service worker activates without claiming the page that registered it, so wait for
 * activation and reload once: from then on every request goes through the precache.
 */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
}

test('calculates the standard check: 5 mg in 2 mL, 250 mcg is 10 units', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '250 mcg')
  await expect(page.getByTestId('draw-headline')).toHaveText('10')
  await expect(
    page.locator('.draw-result').getByText('0.1 mL', { exact: true }).first(),
  ).toBeVisible()
})

test('the mixing advisor dilutes GHK-Cu and fills in the water', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /GHK-Cu/ }).click()
  await choose(page, 'Peptide in vial', '50 mg')
  await choose(page, 'Bacteriostatic water added', '3 mL')
  await choose(page, 'Dose', '1 mg')
  await expect(page.getByText(/16\.7 mg\/mL is stronger/)).toBeVisible()
  await expect(page.getByText(/same syringe up to 10 units/)).toBeVisible()

  await page.getByRole('button', { name: 'Help me choose' }).click()
  await expect(page.getByTestId('advisor-water')).toHaveText('3')
  await expect(page.getByTestId('advisor-top-up')).toContainText('10 units')
  await choose(page, 'Vial size', '10 mL')
  await expect(page.getByTestId('advisor-water')).toHaveText('10')
  await page.getByRole('button', { name: 'Use 10 mL' }).click()

  await expect(page.getByTestId('draw-headline')).toHaveText('20')
  await expect(page.getByText(/is stronger than/)).toBeHidden()
})

test('saves a vial, logs a draw and tracks the balance', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  // Semaglutide defaults: 5 mg vial, 3 mL water, 0.25 mg dose.
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  // A dose other than the vial's typical one: logging must not reset it.
  await choose(page, 'Dose', '0.5 mg')
  await expect(page.getByTestId('draw-headline')).toHaveText('30')
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 0.5 mg of Semaglutide/)).toBeVisible()
  await expect(page.getByTestId('draw-headline')).toHaveText('30')

  await page.getByRole('link', { name: 'Open vial' }).click()
  await expect(page.getByText('4.5', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('1 draw')).toBeVisible()
  await expect(page.locator('.pk-chart canvas')).toBeVisible()

  // The next draw starts from the last one, not the vial's typical 0.25 mg.
  await page.getByRole('button', { name: 'Log a draw' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Dose', { exact: true })).toHaveValue('0.5')
  await expect(dialog.getByText('Last drawn: 0.5 mg, today.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('main').getByRole('link', { name: 'Calculator' }).click()
  await expect(page.getByTestId('draw-headline')).toHaveText('30')
})

test('numbers twin vials, ages them, and pages the draw history', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  for (let i = 0; i < 2; i++) {
    await page.goto('./#/')
    await expect(page.getByTestId('draw-headline')).toHaveText('15')
    await page.getByRole('button', { name: 'Save vial to shelf' }).click()
    await expect(page.getByText('From your shelf')).toBeVisible()
  }
  for (let i = 0; i < 11; i++) {
    await page.getByRole('button', { name: 'Log this draw now' }).click()
  }

  await page.goto('./#/shelf')
  await expect(page.getByRole('link', { name: /^Semaglutide #1/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Semaglutide #2/ })).toBeVisible()
  await expect(page.getByText('Day 0 of 28')).toHaveCount(2)

  await page.goto('./#/protocols')
  await expect(page.getByText('1–10 of 11 draws')).toBeVisible()
  await expect(page.getByText(/· Semaglutide #2/)).toHaveCount(10)
  await page
    .getByRole('navigation', { name: 'draws pages' })
    .getByRole('button', { name: /2/ })
    .click()
  await expect(page.getByText('11–11 of 11 draws')).toBeVisible()
  await page.getByRole('button', { name: 'Oldest first' }).click()
  await expect(page.getByText('1–10 of 11 draws')).toBeVisible()
})

test('sets a protocol, counts down to the next dose, and filters draws by peptide', async ({
  page,
}) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 0.25 mg of Semaglutide/)).toBeVisible()
  await page.goto('./#/')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '250 mcg')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 250 mcg of BPC-157/)).toBeVisible()

  // The old History tab's address still opens the tab that replaced it.
  await page.goto('./#/history')
  await expect(page).toHaveURL(/#\/protocols$/)
  await expect(page.getByText('No protocols yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Add a protocol' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await dialog.locator('.v-select').filter({ hasText: 'Peptide' }).click()
  await page.getByRole('option', { name: 'Semaglutide' }).click()
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Weekly' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Protocol added for Semaglutide')).toBeVisible()
  await expect(page.getByText(/^Next dose .+, in 7 days$/)).toBeVisible()

  await page.getByRole('button', { name: 'Edit protocol for Semaglutide' }).click()
  const edit = page.getByRole('dialog').filter({ hasText: 'Protocol for Semaglutide' })
  await edit.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Twice daily' }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/^Next dose at .+, in about 12 hours$/)).toBeVisible()

  await expect(page.getByText(/· (Semaglutide|BPC-157)$/)).toHaveCount(2)
  await page.locator('.v-select').filter({ hasText: 'All peptides' }).click()
  await page.getByRole('option', { name: 'BPC-157' }).click()
  await expect(page.getByText(/· BPC-157$/)).toHaveCount(1)
  await expect(page.getByText(/· Semaglutide$/)).toHaveCount(0)
})

/** The pulse is infinite, so merely shortening it, as the app's global rule does, would strobe. */
async function expectStillDotWithReducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const pulse = await page
    .locator('.level-backdrop__dot--live')
    .first()
    .evaluate((dot) => getComputedStyle(dot, '::after').animationName)
  expect(pulse).toBe('none')
}

test('projects levels while setting a protocol, then draws them on its card', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  await page.goto('./#/')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  await page.goto('./#/protocols')
  await page.getByRole('button', { name: 'Add a protocol' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  const panel = dialog.getByRole('region', { name: 'Projected levels' })
  const pick = async (peptide: string) => {
    await dialog.locator('.v-select').filter({ hasText: 'Peptide' }).click()
    await page.getByRole('option', { name: peptide }).click()
  }

  // No human data: the form says why rather than drawing a curve.
  await pick('BPC-157')
  await expect(dialog.getByText('No human pharmacokinetic data', { exact: false })).toBeVisible()
  await expect(panel).toBeHidden()

  // The vial's usual dose is the user's own, so the projection reads in it.
  await pick('Semaglutide')
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Weekly' }).click()
  await expect(panel.getByText('At 0.25 mg weekly.')).toBeVisible()
  await expect(panel.getByRole('img', { name: /Projected levels\. Steady by/ })).toBeVisible()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Protocol added for Semaglutide')).toBeVisible()

  // Nothing has been drawn, so the card has no level to show.
  await expect(page.locator('.level-backdrop')).toHaveCount(0)
  await page.goto('./#/shelf')
  await page
    .getByRole('link', { name: /Semaglutide/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Log a draw' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Log draw' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.goto('./#/protocols')
  await expect(page.locator('.level-backdrop svg')).toBeVisible()
  await expect(page.getByText(/^Est\. .+ now · Steady by /)).toBeVisible()
  await expectStillDotWithReducedMotion(page)
})

test('overlays the levels of several peptides on one chart', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await page.goto('./#/')
  await expect(page.getByRole('button', { name: 'Save vial to shelf' })).toBeVisible()
  await page.locator('.v-select').first().click()
  await page
    .getByRole('option', { name: /Tirzepatide/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged .+ of Tirzepatide/)).toBeVisible()

  await page.goto('./#/protocols')
  await expect(page.getByRole('img', { name: /Estimated amount in the body now/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Overlay' }).click()
  const chart = page.getByRole('img', { name: /each scaled to its own peak/ })
  await expect(chart).toHaveAttribute(
    'aria-label',
    /Semaglutide .+Tirzepatide|Tirzepatide .+Semaglutide/,
  )
  await page.locator('.v-chip').filter({ hasText: 'Semaglutide' }).click()
  await expect(chart).not.toHaveAttribute('aria-label', /Semaglutide/)
  await page.getByRole('button', { name: 'Show as table' }).click()
  await expect(page.getByRole('columnheader', { name: 'Tirzepatide' })).toBeVisible()
})

test('shows doses and levels of several peptides under the weight chart', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await page.goto('./#/')
  await expect(page.getByRole('button', { name: 'Save vial to shelf' })).toBeVisible()
  await page.locator('.v-select').first().click()
  await page
    .getByRole('option', { name: /Tirzepatide/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged .+ of Tirzepatide/)).toBeVisible()

  await page.goto('./#/journal')
  await page.getByRole('button', { name: 'Log weight' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Weight').fill('90')
  await dialog.getByRole('button', { name: 'Save' }).click()

  const doses = page.getByRole('button', { name: 'Doses', exact: true })
  await expect(doses).toHaveAttribute('aria-pressed', 'false')
  await doses.click()
  await page.getByRole('button', { name: 'Levels', exact: true }).click()
  // Two peptides: their amounts are not comparable, so levels read as percent of peak.
  const chart = page.getByRole('img', { name: /^Weight .+Doses below: / })
  await expect(chart).toHaveAttribute('aria-label', /Tirzepatide, 1 dose .+Semaglutide, 1 dose/)
  await expect(chart).toHaveAttribute('aria-label', /% of peak/)

  // One peptide reads in its own unit.
  await page.locator('.v-chip').filter({ hasText: 'Semaglutide' }).click()
  await expect(chart).toHaveAttribute('aria-label', /Tirzepatide \d[\d.]* mg\.$/)

  await page.getByRole('button', { name: 'Show as table' }).first().click()
  await expect(page.getByRole('columnheader', { name: 'Doses' })).toBeVisible()

  await page.getByRole('button', { name: 'Share weight as an image' }).click()
  const share = page.getByRole('dialog', { name: 'Share as an image' })
  await share.getByLabel('Include my doses').check()
  await expect(share.getByText('Shown as Peptide A, Peptide B.')).toBeVisible()
  await expect(share.getByAltText('Preview of the image to share')).toBeVisible()
})

test('works offline after the first visit, including stored data', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit does not drive service workers reliably; offline is verified on Chromium',
  )
  await page.goto('./')
  await acceptDisclaimer(page)
  await waitForServiceWorker(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  await context.setOffline(true)
  await page.goto('./#/shelf')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Vials' })).toBeVisible()
  await expect(page.getByText('Semaglutide').first()).toBeVisible()

  // The calculator chunk (with the chart library) must also come from the precache.
  await page.goto('./#/')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await context.setOffline(false)
})

test('serves a manifest and service worker scoped to the base path', async ({
  page,
  request,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit does not drive service workers reliably; offline is verified on Chromium',
  )
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/app/manifest.webmanifest')
  const manifest = await (await request.get(href!)).json()
  expect(manifest.start_url).toBe('/app/')
  expect(manifest.scope).toBe('/app/')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/app/')
})

test('makes no third-party requests', async ({ page }) => {
  const foreign: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.hostname !== 'localhost') foreign.push(r.url())
  })
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.goto('./#/settings')
  await page.goto('./#/shelf')
  expect(foreign).toEqual([])
})

test('the disclaimer blocks scrolling the page behind it until accepted', async ({
  page,
  browserName,
  isMobile,
}) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: "I'm 18 or older and understand" })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('overflow-y', 'hidden')
  // Playwright cannot wheel or swipe in mobile WebKit; there the root lock above is the check.
  if (!(browserName === 'webkit' && isMobile)) {
    await page.mouse.move(20, 400)
    await page.mouse.wheel(0, 600)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  }

  await acceptDisclaimer(page)
  await expect(page.locator('html')).not.toHaveCSS('overflow-y', 'hidden')
})

test.describe('install guide on iOS Chrome', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  })

  test('shows the Chrome steps with a screenshot', async ({ page }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await page.getByRole('link', { name: 'Settings' }).first().click()
    await expect(page.getByText('Share button in the address bar')).toBeVisible()
    const shot = page.getByRole('img', { name: /Chrome's Share menu on iPhone/ })
    await shot.scrollIntoViewIfNeeded()
    await expect
      .poll(() => shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0)
  })
})

/**
 * Scroll the way a finger does, a frame at a time, rather than jumping straight to the end.
 * `scrollBy` rather than the mouse wheel, which Playwright cannot drive in mobile WebKit.
 */
async function scrollInSteps(page: Page, step: number, steps: number) {
  for (let i = 0; i < steps; i++) {
    const before = await page.evaluate(() => window.scrollY)
    await page.evaluate((dy) => window.scrollBy(0, dy), step)
    await page.waitForFunction(
      ([from, dy]) => Math.abs(window.scrollY - from) >= Math.abs(dy) - 1,
      [before, step] as const,
    )
    // Let the bar's per-frame scroll handler see each step, as it would during a real swipe.
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
}

test('the top bar scrolls away when reading and returns on scrolling up', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /Semaglutide/ }).click()
  await choose(page, 'Dose', '0.5 mg')
  const bar = page.locator('.v-app-bar')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(bar).not.toHaveClass(/pc-app-bar--hidden/)
  await scrollInSteps(page, 120, 4)
  await expect(bar).toHaveClass(/pc-app-bar--hidden/)
  await scrollInSteps(page, -80, 1)
  await expect(bar).not.toHaveClass(/pc-app-bar--hidden/)

  // Hidden again, then a tap on plain page background brings it back.
  await page.evaluate(() => window.scrollTo(0, 0))
  await scrollInSteps(page, 120, 4)
  await expect(bar).toHaveClass(/pc-app-bar--hidden/)
  await page
    .locator('.pc-page')
    .first()
    .click({ position: { x: 4, y: 200 } })
  await expect(bar).not.toHaveClass(/pc-app-bar--hidden/)
})

test('in a browser, Take a photo opens the file chooser from the tap itself', async ({ page }) => {
  await page.goto('./#/journal')
  await acceptDisclaimer(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Take a photo' }).click()
  await chooser
  await expect(page.getByText('Allow the camera')).toBeHidden()
})

test('a hidden top bar leaves only blank glass behind the status bar', async ({ page }) => {
  await page.goto('./#/settings')
  await acceptDisclaimer(page)
  // What Capacitor sets on a phone that draws edge to edge, such as a Pixel 10 Pro.
  const inset = 52
  await page.evaluate((px) => {
    document.documentElement.style.setProperty('--safe-area-inset-top', `${px}px`)
  }, inset)
  const bar = page.locator('.v-app-bar')
  const row = bar.locator('.v-toolbar__content')
  await expect(row).toHaveCSS('opacity', '1')
  await scrollInSteps(page, 150, 4)
  await expect(bar).toHaveClass(/pc-app-bar--hidden/)
  await expect(row).toHaveCSS('opacity', '0')
  await expect(row).toHaveCSS('pointer-events', 'none')
  await expect
    .poll(async () => {
      const box = await bar.boundingBox()
      return box ? Math.round(box.y + box.height) : null
    })
    .toBe(inset)

  await scrollInSteps(page, -80, 1)
  await expect(row).toHaveCSS('opacity', '1')
})

/*
 * Chrome on Android sends no click for a tap that stops a fling, so this drives raw touches
 * through the DevTools protocol: a fast swipe, then a tap on a tab while the page still coasts.
 */
async function flingThenTapTab(page: Page, title: string) {
  const tab = await page.locator('.v-bottom-navigation .v-btn', { hasText: title }).boundingBox()
  if (!tab) throw new Error(`${title} tab has no box`)
  const cdp = await page.context().newCDPSession(page)
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  await touch('touchStart', [{ x: 200, y: 600 }])
  for (let y = 560; y >= 200; y -= 40) await touch('touchMove', [{ x: 200, y }])
  await touch('touchEnd', [])
  const before = await page.evaluate(() => window.scrollY)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before)

  await touch('touchStart', [{ x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 }])
  await touch('touchEnd', [])
  await cdp.detach()
}

test('a tab tapped while the page is still coasting from a fling opens', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'raw touch input needs the DevTools protocol')
  await page.goto('./')
  await acceptDisclaimer(page)
  const tab = (title: string) => page.locator('.v-bottom-navigation .v-btn', { hasText: title })
  test.skip((await tab('Shelf').count()) === 0, 'phones only: wide layouts have a rail')

  await flingThenTapTab(page, 'Shelf')
  await expect(page.getByRole('heading', { level: 1, name: 'Vials' })).toBeVisible()

  // Back on the first tab, the Shelf tab no longer looks pressed (no ripple left behind).
  await tab('Calculator').tap()
  await expect(page.getByRole('heading', { level: 1, name: 'How much to draw' })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation .v-ripple__container')).toHaveCount(0)
  await expect(page.locator('.v-bottom-navigation .v-btn--active')).toHaveText('Calculator')

  /*
   * Android keeps :hover on the last element a completed tap landed on, and a tap that stops a
   * fling does not move it, so the tab left behind can stay hovered. Emulation moves hover on
   * every touch, so the stale hover is placed directly. A touch screen shows no hover tint.
   */
  const shelf = await tab('Shelf').boundingBox()
  if (!shelf) throw new Error('Shelf tab has no box')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: shelf.x + shelf.width / 2,
    y: shelf.y + shelf.height / 2,
  })
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  expect(await tab('Shelf').evaluate((el) => el.matches(':hover'))).toBe(true)
  await expect(tab('Shelf').locator('.v-btn__overlay')).toHaveCSS('opacity', '0')
})

test('estimated levels can be previewed as a shareable image', async ({ page }) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /Semaglutide/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '0.5 mg')
  await page.getByRole('button', { name: 'Share as an image' }).click()
  const preview = page.getByAltText('Preview of the image to share')
  await expect(preview).toBeVisible()
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1080, 1350])
  await page.getByLabel('Show amounts').click()
  await expect(page.getByRole('button', { name: 'Share image' })).toBeEnabled()
})

test('shares the mix and the draw as an image', async ({ page }) => {
  // Take the download path on every browser: a share sheet cannot be driven from a test.
  await page.addInitScript(() => {
    delete (navigator as { canShare?: unknown }).canShare
  })
  await page.goto('./')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '250 mcg')
  await page.getByRole('button', { name: 'Share draw as an image' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share this draw' })
  const preview = dialog.getByAltText('Preview of the image to share')
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([1080, 1350])
  const image = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Share' }).click()
  expect((await image).suggestedFilename()).toMatch(/^pepcalc-bpc-157-draw-\d{4}-\d{2}-\d{2}\.png$/)
})

test('exports draws and estimated levels as a PDF, offline', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit does not drive service workers reliably; offline is verified on Chromium',
  )
  await page.goto('./')
  await acceptDisclaimer(page)
  await waitForServiceWorker(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 0.25 mg of Semaglutide/)).toBeVisible()

  // The PDF writer is a lazily loaded chunk; it must come from the precache.
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Protocols' }).first().click()
  await page.getByRole('button', { name: 'Export PDF' }).click()
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: 'Export PDF' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^pepcalc-report-\d{4}-\d{2}-\d{2}\.pdf$/)
  const bytes = Buffer.from(await (await file.createReadStream()).toArray().then(Buffer.concat))
  const text = bytes.toString('latin1')
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  expect(text.endsWith('%%EOF\n')).toBe(true)
  expect(text).toContain('(Semaglutide)')
  await expect(page.getByRole('dialog')).toBeHidden()
  await context.setOffline(false)
})
