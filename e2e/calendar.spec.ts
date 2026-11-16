import { expect, test, type Page } from '@playwright/test'
import {
  DOSE_KIND,
  TIMELINE_HASH,
  fillNewDose,
  prepareDoseTarget,
  verifyScheduledCalendar,
} from './app-helpers'
import { acceptDisclaimer, choose, chooseUnits, waitForServiceWorker } from './helpers'

const FIXED_NOW = new Date(2026, 10, 16, 12, 0)

async function logWeight(page: Page, kg: string) {
  const weight = page.getByRole('dialog', { name: 'Weigh-in' })
  await weight.getByLabel('Weight').fill(kg)
  await weight.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()
}

test('shows entries on the month calendar, logs for a past day, edits, navigates by keyboard, and works offline', async ({
  page,
  context,
  browserName,
}) => {
  await page.clock.install({ time: FIXED_NOW })
  await page.clock.resume()

  await page.goto('./')
  await acceptDisclaimer(page)
  await chooseUnits(page, { weight: 'kg' })
  await prepareDoseTarget(page)

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Log' })
    .getByRole('button', { name: DOSE_KIND.row, exact: true })
    .click()
  await fillNewDose(page)

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Log' })
    .getByRole('button', { name: 'Weight', exact: true })
    .click()
  await logWeight(page, '82.4')

  await page.goto(`./#/${TIMELINE_HASH}`)
  await choose(page, 'View', 'Calendar')
  await expect(page).toHaveURL(new RegExp(`#/${TIMELINE_HASH}\\?view=calendar$`))

  const calendar = page.locator('.entries-calendar')
  const panel = page.locator('.day-panel')
  await expect(panel).toContainText('Today')
  await expect(panel).toContainText(DOSE_KIND.expectedTitle)
  await expect(panel).toContainText('82.4 kg')

  await calendar.getByRole('button', { name: 'Previous month' }).click()
  await expect(calendar).toContainText('October 2026')
  await calendar.getByRole('button', { name: 'Next month' }).click()
  await expect(calendar).toContainText('November 2026')
  await calendar.getByRole('button', { name: 'Previous month' }).click()
  await expect(calendar).toContainText('October 2026')
  await calendar.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(calendar).toContainText('November 2026')
  await expect(panel).toContainText('Today')

  // Choose yesterday, log a weight for that day, and verify mark + panel.
  await calendar.locator('[data-v-date="2026-11-15"]').click()
  await expect(panel).toContainText('Yesterday')
  await expect(panel).toContainText('Nothing logged.')
  await panel.getByRole('button', { name: 'Log for this day' }).click()
  await page
    .getByRole('dialog', { name: 'Log' })
    .getByRole('button', { name: 'Weight', exact: true })
    .click()
  const weightDialog = page.getByRole('dialog', { name: 'Weigh-in' })
  await expect(weightDialog.getByLabel('When')).toHaveValue('2026-11-15T12:00')
  await logWeight(page, '81.8')

  await expect(calendar.locator('[data-v-date="2026-11-15"] .cal-mark--logged')).toBeVisible()
  await expect(panel).toContainText('81.8 kg')

  // Tap entry in the panel, edit it, and verify update.
  await panel.getByRole('button', { name: /81\.8 kg/ }).click()
  await weightDialog.getByLabel('Weight').fill('81.5')
  await weightDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight updated')).toBeVisible()
  await expect(panel).toContainText('81.5 kg')
  await expect(panel).not.toContainText('81.8 kg')

  // Reload keeps ?view=calendar.
  await page.reload()
  await expect(calendar).toBeVisible()
  await expect(panel).toBeVisible()

  // Keyboard navigation on Chromium: arrow keys move between days and Enter selects.
  if (browserName === 'chromium') {
    const grid = calendar.locator('.v-date-picker-month__days[role="grid"]')
    await grid.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await expect(panel).toContainText('Yesterday')
  }

  // Verify scheduled marks in each app.
  await verifyScheduledCalendar(page)

  // Offline check.
  if (browserName !== 'webkit') {
    await page.goto(`./#/${TIMELINE_HASH}?view=calendar`)
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await page.reload()
    await expect(calendar).toBeVisible()
    await expect(panel).toContainText('82.4 kg')
    await context.setOffline(false)
  }
})
