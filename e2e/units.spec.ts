import { expect, test, type Page } from '@playwright/test'
import { openUnitsScreen, UNITS_CARD_TITLE } from './app-helpers'
import { acceptDisclaimer, choose, waitForServiceWorker } from './helpers'

function toggleButton(page: Page, group: string, label: string) {
  return page.getByRole('group', { name: group }).getByRole('button', { name: label, exact: true })
}

test.describe('en-US default units', () => {
  test.use({ locale: 'en-US' })

  test('opens in lb and ft in, shows lb suffix on weigh-in, and navigates from Change', async ({
    page,
  }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await openUnitsScreen(page)
    await expect(page.getByText('Units: lb, ft in.')).toBeVisible()

    await page
      .getByRole('button', { name: /^Log (a )?weight$/ })
      .first()
      .click()
    const weighIn = page.getByRole('dialog', { name: 'Weigh-in' })
    await expect(weighIn.getByText('lb', { exact: true })).toBeVisible()
    await weighIn.getByRole('button', { name: 'Cancel' }).click()
    await expect(weighIn).toBeHidden()

    await page.getByRole('link', { name: 'Change' }).click()
    await expect(page).toHaveURL(/#\/settings#units$/)
    const unitsCard = page.locator('#units')
    await expect(unitsCard).toContainText(UNITS_CARD_TITLE)
    await expect(unitsCard).toBeInViewport()
    await expect(toggleButton(page, 'Weight unit', 'Pounds')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Height unit', 'Feet and inches')).toHaveClass(/v-btn--active/)
  })

  test('keeps a manual unit change across reloads', async ({ page }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
    await choose(page, 'Weight unit', 'Kilograms')
    await expect(toggleButton(page, 'Weight unit', 'Kilograms')).toHaveClass(/v-btn--active/)

    // Wait for the async IndexedDB write before forcing a full page reload.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const dbs = await indexedDB.databases()
          const name = dbs[0]?.name
          if (!name) return null
          return new Promise<unknown>((resolve) => {
            const open = indexedDB.open(name)
            open.onsuccess = () => {
              const req = open.result
                .transaction('settings')
                .objectStore('settings')
                .get('weightUnit')
              req.onsuccess = () =>
                resolve((req.result as { value?: unknown } | undefined)?.value ?? null)
              req.onerror = () => resolve(null)
            }
            open.onerror = () => resolve(null)
          })
        }),
      )
      .toBe('kg')

    await page.reload()
    await expect(toggleButton(page, 'Weight unit', 'Kilograms')).toHaveClass(/v-btn--active/)
  })
})

test.describe('de-DE default units', () => {
  test.use({ locale: 'de-DE' })

  test('opens in kg, cm, and mg/dL', async ({ page }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await openUnitsScreen(page)
    await expect(page.getByText('Units: kg, cm.')).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
    await expect(toggleButton(page, 'Weight unit', 'Kilograms')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Height unit', 'Centimetres')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Blood glucose unit', 'mg/dL')).toHaveClass(/v-btn--active/)
  })
})

test.describe('en-GB default units', () => {
  test.use({ locale: 'en-GB' })

  test('opens in kg, ft in, mmol/L, and mmol/mol', async ({ page }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await openUnitsScreen(page)
    await expect(page.getByText('Units: kg, ft in.')).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
    await expect(toggleButton(page, 'Weight unit', 'Kilograms')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Height unit', 'Feet and inches')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Blood glucose unit', 'mmol/L')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'HbA1c unit', 'mmol/mol')).toHaveClass(/v-btn--active/)
  })

  test('detects regional units offline on a fresh database after service worker install', async ({
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

    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(
          (d) =>
            new Promise<void>((resolve) => {
              if (!d.name) {
                resolve()
                return
              }
              const req = indexedDB.deleteDatabase(d.name)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            }),
        ),
      )
    })

    await context.setOffline(true)
    await page.reload()
    await acceptDisclaimer(page)
    await openUnitsScreen(page)
    await expect(page.getByText('Units: kg, ft in.')).toBeVisible()
    await context.setOffline(false)
  })
})

test.describe('en-CA default units', () => {
  test.use({ locale: 'en-CA' })

  test('opens in kg, ft in, mmol/L, and %', async ({ page }) => {
    await page.goto('./')
    await acceptDisclaimer(page)
    await openUnitsScreen(page)
    await expect(page.getByText('Units: kg, ft in.')).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
    await expect(toggleButton(page, 'Weight unit', 'Kilograms')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Height unit', 'Feet and inches')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'Blood glucose unit', 'mmol/L')).toHaveClass(/v-btn--active/)
    await expect(toggleButton(page, 'HbA1c unit', 'Percent (%)')).toHaveClass(/v-btn--active/)
  })
})
