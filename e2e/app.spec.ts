import { expect, test, type Page } from '@playwright/test'
import { acceptDisclaimer, choose, waitForServiceWorker } from './helpers'

/** Opens the Calculator view and accepts the first-run notice. */
async function openCalculator(page: Page) {
  await page.goto('./#/calculator')
  await acceptDisclaimer(page)
}

test('calculates the standard check: 5 mg in 2 mL, 250 mcg is 10 units', async ({ page }) => {
  await openCalculator(page)
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
  await openCalculator(page)
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
  await openCalculator(page)
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
  await expect(page.getByText("Levels are on the peptide's page.")).toBeVisible()

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
  await openCalculator(page)
  for (let i = 0; i < 2; i++) {
    await page.goto('./#/calculator')
    await expect(page.getByTestId('draw-headline')).toHaveText('15')
    await page.getByRole('button', { name: 'Save vial to shelf' }).click()
    await expect(page.getByText('From your shelf')).toBeVisible()
  }
  for (let i = 0; i < 11; i++) {
    await page.getByRole('button', { name: 'Log this draw now' }).click()
  }

  await page.goto('./#/shelf')
  await page.getByRole('link', { name: /^Semaglutide/ }).click()
  await expect(page.getByRole('link', { name: /^Semaglutide #1/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Semaglutide #2/ })).toBeVisible()
  await expect(page.getByText('Day 0 of 28')).toHaveCount(2)

  await page.getByRole('link', { name: /^Semaglutide #2/ }).click()
  await expect(page.getByText('1–10 of 11 entries')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'entries pages' })
    .getByRole('button', { name: /2/ })
    .click()
  await expect(page.getByText('11–11 of 11 entries')).toBeVisible()
  await page.getByRole('button', { name: 'Oldest first' }).click()
  await expect(page.getByText('1–10 of 11 entries')).toBeVisible()

  await page.goto('./#/progress/entries')
  await expect(page.getByText('1–10 of 11 entries')).toBeVisible()
  await expect(page.getByText('0.25 mg Semaglutide #2')).toHaveCount(10)
})

test('sets a protocol, counts down to the next dose, and filters draws by peptide', async ({
  page,
}) => {
  await openCalculator(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 0.25 mg of Semaglutide/)).toBeVisible()
  await page.goto('./#/calculator')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '250 mcg')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 250 mcg of BPC-157/)).toBeVisible()

  // The old History tab's address still opens the Stack tab that replaced it.
  await page.goto('./#/history')
  await expect(page).toHaveURL(/#\/stack$/)
  await page.getByRole('link', { name: /^Semaglutide/ }).click()

  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await dialog.getByLabel('Every', { exact: true }).fill('7')
  await dialog.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'days', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Protocol added for Semaglutide')).toBeVisible()
  await expect(page.getByText('Due in 7 days')).toBeVisible()

  await page.getByRole('button', { name: 'Edit schedule' }).click()
  const edit = page.getByRole('dialog').filter({ hasText: 'Protocol for Semaglutide' })
  await edit.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await edit.getByLabel('Every', { exact: true }).fill('12')
  await edit.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'hours', exact: true }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Due in 12 hours')).toBeVisible()

  await page.goto('./#/progress/entries')
  await page.getByRole('button', { name: /^Draws / }).click()
  await expect(page.getByText('0.25 mg Semaglutide')).toBeVisible()
  await expect(page.getByText('250 mcg BPC-157')).toBeVisible()
})

test('projects levels while setting a protocol, then draws them on its page', async ({ page }) => {
  await openCalculator(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  await page.goto('./#/calculator')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  // No human data: the form says why rather than drawing a curve.
  await page.goto('./#/stack')
  await page.getByRole('link', { name: /^BPC-157/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const bpcDialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await expect(bpcDialog.getByText('No human pharmacokinetic data', { exact: false })).toBeVisible()
  await expect(bpcDialog.getByRole('region', { name: 'Projected levels' })).toBeHidden()
  await bpcDialog.getByRole('button', { name: 'Cancel' }).click()

  // The vial's usual dose is the user's own, so the projection reads in it.
  await page.goto('./#/stack')
  await page.getByRole('link', { name: /^Semaglutide/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  const panel = dialog.getByRole('region', { name: 'Projected levels' })
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await dialog.getByLabel('Every', { exact: true }).fill('7')
  await dialog.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'days', exact: true }).click()
  await expect(panel.getByText('At 0.25 mg weekly.')).toBeVisible()
  await expect(panel.getByRole('img', { name: /Projected levels\. Steady by/ })).toBeVisible()
  await expect(panel.getByText('Estimate from the half-life')).toBeHidden()
  await panel.getByRole('button', { name: 'More information' }).click()
  await expect(panel.getByText('Estimate from the half-life')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Protocol added for Semaglutide')).toBeVisible()

  // Nothing has been drawn, so the chart has no peak yet; after a draw, it shows the peak.
  await expect(
    page.getByRole('img', { name: 'Estimated amount in the body now: 0 mg.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Log a draw' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Log draw' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(
    page.getByRole('img', { name: /Estimated amount in the body now: .*Peak 0\.19/ }),
  ).toBeVisible()
})

test('calculates a draw from a protocol, then switches vial', async ({ page }) => {
  await openCalculator(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use a different vial' })).toBeHidden()

  // A second vial of the same peptide, used most recently, with less water.
  await page.goto('./#/calculator')
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/^Logged /)).toBeVisible()

  await page.goto('./#/stack')
  await page.getByRole('link', { name: /^Semaglutide/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await dialog.getByLabel('Every', { exact: true }).fill('7')
  await dialog.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'days', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('link', { name: 'Calculate', exact: true }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
  await expect(page.getByText('5 mg in 2 mL')).toBeVisible()
  await expect(page.getByTestId('draw-headline')).toHaveText('10')

  await page.getByRole('button', { name: 'Use a different vial' }).click()
  await page.getByRole('listitem').filter({ hasText: '5 mg in 3 mL' }).click()
  await expect(page.getByText('5 mg in 3 mL')).toBeVisible()
  await expect(page.getByTestId('draw-headline')).toHaveText('15')
})

test('overlays the levels of several peptides on one chart', async ({ page }) => {
  await openCalculator(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged .+ of Semaglutide/)).toBeVisible()
  await page.goto('./#/calculator')
  await expect(page.getByRole('button', { name: 'Save vial to shelf' })).toBeVisible()
  await page.locator('.v-select').first().click()
  await page
    .getByRole('option', { name: /Tirzepatide/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged .+ of Tirzepatide/)).toBeVisible()

  await page.goto('./#/stack')
  await page.getByRole('link', { name: 'Compare levels' }).click()
  const chart = page.getByRole('img', { name: /each scaled to its own peak/ })
  await expect(chart).toHaveAttribute(
    'aria-label',
    /Semaglutide .+Tirzepatide|Tirzepatide .+Semaglutide/,
  )
  await page.locator('.v-chip').filter({ hasText: 'Semaglutide' }).click()
  await expect(chart).not.toHaveAttribute('aria-label', /Semaglutide/)
  const more = page.getByRole('button', { name: 'More information' }).first()
  await expect(page.getByText('each scaled to its own peak')).toBeHidden()
  await more.click()
  await expect(page.getByText('each scaled to its own peak')).toBeVisible()
})

test("marks one peptide's doses on the weight line and switches peptide", async ({ page }) => {
  await openCalculator(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('link', { name: 'Open vial' }).click()
  for (const [when, amount] of [
    ['2026-06-01T09:00', '0.25'],
    ['2026-06-08T09:00', '0.5'],
  ] as const) {
    await page.getByRole('button', { name: 'Log a draw' }).first().click()
    const draw = page.getByRole('dialog')
    await draw.getByLabel('Dose').fill(amount)
    await draw.getByLabel('Taken at').fill(when)
    await draw.getByRole('button', { name: 'Log draw' }).click()
    await expect(draw).toBeHidden()
  }

  await page.goto('./#/calculator')
  await expect(page.getByRole('button', { name: 'Save vial to shelf' })).toBeVisible()
  await page.locator('.v-select').first().click()
  await page
    .getByRole('option', { name: /Tirzepatide/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('link', { name: 'Open vial' }).click()
  await page.getByRole('button', { name: 'Log a draw' }).first().click()
  const tirzDraw = page.getByRole('dialog')
  await tirzDraw.getByLabel('Dose').fill('2.5')
  await tirzDraw.getByLabel('Taken at').fill('2026-06-15T09:00')
  await tirzDraw.getByRole('button', { name: 'Log draw' }).click()
  await expect(tirzDraw).toBeHidden()

  await page.goto('./#/progress')
  for (const [when, weight] of [
    ['2026-06-01T08:00', '92'],
    ['2026-06-22T08:00', '88'],
  ] as const) {
    await page.getByRole('button', { name: 'Log', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Log' })
      .getByRole('button', { name: 'Weight', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Weigh-in' })
    await dialog.getByLabel('Weight').fill(weight)
    await dialog.getByLabel('When').fill(when)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Weight logged')).toBeVisible()
  }

  const group = page.getByRole('group', { name: 'Doses of' })
  const tirzChip = group.getByRole('button', { name: 'Tirzepatide' })
  const semaChip = group.getByRole('button', { name: 'Semaglutide' })
  await expect(tirzChip).toHaveAttribute('aria-pressed', 'true')
  await expect(semaChip).toHaveAttribute('aria-pressed', 'false')

  const legend = page.getByRole('list', { name: 'Doses' })
  await expect(legend.getByRole('listitem')).toHaveCount(1)
  await expect(legend).toContainText('2.5 mg')

  await semaChip.click()
  await expect(semaChip).toHaveAttribute('aria-pressed', 'true')
  await expect(legend.getByRole('listitem')).toHaveCount(2)
  await expect(legend).toContainText('0.25 mg')
  await expect(legend).toContainText('0.5 mg')

  await page.getByRole('button', { name: 'Share weight as an image' }).click()
  const share = page.getByRole('dialog', { name: 'Share as an image' })
  await expect(share.getByLabel('Include estimated levels')).toHaveCount(0)
  const includeDoses = share.getByLabel('Include my doses')
  await expect(includeDoses).not.toBeChecked()
  await includeDoses.check()
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
  await openCalculator(page)
  await waitForServiceWorker(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  await context.setOffline(true)
  await page.goto('./#/shelf')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Stack' })).toBeVisible()
  await expect(page.getByText('Semaglutide').first()).toBeVisible()

  // The calculator chunk (with the chart library) must also come from the precache.
  await page.goto('./#/calculator')
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
  expect(manifest.shortcuts).toContainEqual({ name: 'Calculator', url: '/app/#/calculator' })
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/app/')
})

test('makes no third-party requests', async ({ page }) => {
  const foreign: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.hostname !== 'localhost') foreign.push(r.url())
  })
  await openCalculator(page)
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
  // Short enough that the calculator scrolls on a tablet too.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 })
  await openCalculator(page)
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
  await page.goto('./#/progress')
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
    timestamp?: number,
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points,
      ...(timestamp !== undefined && { timestamp }),
    })
  // Explicit timestamps keep the velocity tracker consistent even when CI stalls between IPC calls.
  let t = Date.now() / 1000
  const swipe = [touch('touchStart', [{ x: 200, y: 600 }], t)]
  for (let y = 560; y >= 280; y -= 40) {
    t += 0.008
    swipe.push(touch('touchMove', [{ x: 200, y }], t))
  }
  swipe.push(touch('touchEnd', [], t + 0.008))
  await Promise.all(swipe)
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
  await openCalculator(page)
  const tab = (title: string) => page.locator('.v-bottom-navigation .v-btn', { hasText: title })
  test.skip((await tab('Stack').count()) === 0, 'phones only: wide layouts have a rail')

  await flingThenTapTab(page, 'Stack')
  await expect(page.getByRole('heading', { level: 1, name: 'Stack' })).toBeVisible()

  // Back on the Calculator tab, the Stack tab no longer looks pressed (no ripple left behind).
  await tab('Calculator').tap()
  await expect(page.getByRole('heading', { level: 1, name: 'How much to draw' })).toBeVisible()
  await expect(page.locator('.v-bottom-navigation .v-ripple__container')).toHaveCount(0)
  await expect(page.locator('.v-bottom-navigation .v-btn--active')).toHaveText('Calculator')

  /*
   * Android keeps :hover on the last element a completed tap landed on, and a tap that stops a
   * fling does not move it, so the tab left behind can stay hovered. Emulation moves hover on
   * every touch, so the stale hover is placed directly. A touch screen shows no hover tint.
   */
  const stack = await tab('Stack').boundingBox()
  if (!stack) throw new Error('Stack tab has no box')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: stack.x + stack.width / 2,
    y: stack.y + stack.height / 2,
  })
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  expect(await tab('Stack').evaluate((el) => el.matches(':hover'))).toBe(true)
  await expect(tab('Stack').locator('.v-btn__overlay')).toHaveCSS('opacity', '0')
})

test('estimated levels can be previewed as a shareable image', async ({ page }) => {
  await openCalculator(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /Semaglutide/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '0.5 mg')
  await page.getByRole('button', { name: 'Preview levels' }).click()
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
  await openCalculator(page)
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
  await openCalculator(page)
  await waitForServiceWorker(page)
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 0.25 mg of Semaglutide/)).toBeVisible()

  // The PDF writer is a lazily loaded chunk; it must come from the precache.
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Progress', exact: true }).first().click()
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
