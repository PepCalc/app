import { expect, test } from '@playwright/test'
import {
  EMPTY_TODAY_TITLE,
  SYSTEM_LABEL,
  TILE_TARGET,
  TODAY_LOG_BUTTON,
  prepareTodaySchedule,
  saveDueCardDose,
  saveRepeatedDueDose,
} from './app-helpers'
import { acceptDisclaimer, chooseUnits, waitForServiceWorker } from './helpers'

test('shows Today sections, repeats a dose, links tiles, and survives offline reload', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await chooseUnits(page, { weight: 'kg' })
  await expect(page.getByText(EMPTY_TODAY_TITLE)).toBeVisible()

  await prepareTodaySchedule(page)
  await page.getByRole('button', { name: TODAY_LOG_BUTTON }).first().click()
  await saveDueCardDose(page)

  await expect(page.getByRole('heading', { name: 'Due' })).toBeVisible()
  await expect(page.getByText('Due in 7 days')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'In your system' })).toBeVisible()
  await expect(page.locator('.system-row', { hasText: SYSTEM_LABEL })).toBeVisible()

  // Repeat the last dose in one tap from the due card.
  await page.getByRole('button', { name: TODAY_LOG_BUTTON }).first().click()
  await saveRepeatedDueDose(page)
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()
  await expect(page.locator('.entries-timeline .entry-row')).toHaveCount(2)

  // Log a weight so Latest renders a tile and navigates to Progress / Journal.
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Log' })
    .getByRole('button', { name: 'Weight', exact: true })
    .click()
  const weight = page.getByRole('dialog', { name: 'Weigh-in' })
  await weight.getByLabel('Weight').fill('82.4')
  await weight.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()

  const weightTile = page.locator('.stat-tile', { hasText: 'Weight' })
  await expect(weightTile).toContainText('82.4 kg')
  await weightTile.click()
  await expect(page).toHaveURL(TILE_TARGET.url)
  await expect(page.getByRole('heading', { level: 1, name: TILE_TARGET.heading })).toBeVisible()

  if (browserName !== 'webkit') {
    await page.goto('./')
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Due' })).toBeVisible()
    await expect(page.locator('.stat-tile', { hasText: 'Weight' })).toContainText('82.4 kg')
    await context.setOffline(false)
  }
})
