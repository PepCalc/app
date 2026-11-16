import { expect, test, type Page } from '@playwright/test'
import { acceptDisclaimer, choose, waitForServiceWorker } from './helpers'

async function seedBpc157(page: Page) {
  await page.goto('./#/calculator')
  await acceptDisclaimer(page)
  await page.locator('.v-select').first().click()
  await page.getByRole('option', { name: /BPC-157/ }).click()
  await choose(page, 'Peptide in vial', '5 mg')
  await choose(page, 'Bacteriostatic water added', '2 mL')
  await choose(page, 'Dose', '250 mcg')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
}

test('sets chosen days with course and planned dose, advances twice-daily on log, supports as-needed, and persists offline', async ({
  page,
  context,
  browserName,
}) => {
  // Monday Nov 16, 2026 at 07:00 local time, before 08:00 slot.
  await page.clock.install({ time: new Date(2026, 10, 16, 7, 0, 0) })
  await page.clock.resume()

  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()

  // 1, 3, 4: Mon, Wed, Fri at 08:00, planned dose 250 mcg, course 8 weeks.
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Chosen days', exact: true }).click()
  const daysGroup = dialog.getByRole('group', { name: 'Days' })
  await daysGroup.getByRole('button', { name: 'Monday' }).click()
  await daysGroup.getByRole('button', { name: 'Wednesday' }).click()
  await daysGroup.getByRole('button', { name: 'Friday' }).click()
  await dialog.getByLabel('Time 1').fill('08:00')
  await dialog
    .getByRole('group', { name: 'Planned dose unit' })
    .getByRole('button', { name: 'mcg' })
    .click()
  await dialog.getByLabel('Planned dose (optional)').fill('250')
  await dialog.getByLabel('Course length in weeks (optional)').fill('8')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByText(/Mon, Wed, Fri at (8:00\s*AM|08:00)/)).toBeVisible()
  await expect(page.getByText('Planned: 250 mcg · Week 1 of 8')).toBeVisible()
  await expect(page.getByText('Due in 1 hour')).toBeVisible()

  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await expect(page.getByText(/Mon, Wed, Fri at (8:00\s*AM|08:00)/)).toBeVisible()

  await page.getByRole('link', { name: 'Today', exact: true }).first().click()
  await expect(page.getByText('Due in 1 hour')).toBeVisible()
  await expect(page.getByText('Planned: 250 mcg')).toBeVisible()

  // 3: Next draw dialog starts from planned dose (250 mcg).
  await page.getByRole('button', { name: 'Log a draw' }).click()
  const drawDialog = page.getByRole('dialog', { name: 'Log a draw' })
  await expect(drawDialog.getByLabel('Dose', { exact: true })).toHaveValue('250')
  await drawDialog.getByRole('button', { name: 'Cancel' }).click()

  // 2: Switch to Daily at 08:00 and 20:00, log a draw from Today's due card -> moves to 20:00 (~13 hours).
  await page.getByRole('link', { name: 'BPC-157' }).click()
  await page.getByRole('button', { name: 'Edit schedule' }).click()
  const edit = page.getByRole('dialog').filter({ hasText: 'Protocol for BPC-157' })
  await edit.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Daily', exact: true }).click()
  await edit.getByRole('button', { name: 'Add a time' }).click()
  await edit.getByLabel('Time 1').fill('08:00')
  await edit.getByLabel('Time 2').fill('20:00')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit).toBeHidden()

  await page.getByRole('link', { name: 'Today', exact: true }).first().click()
  await expect(page.getByText('Due in 1 hour')).toBeVisible()
  await page.getByRole('button', { name: 'Log a draw' }).click()
  await page
    .getByRole('dialog', { name: 'Log a draw' })
    .getByRole('button', { name: 'Log draw' })
    .click()
  await expect(page.getByText(/Logged 250 mcg of BPC-157/)).toBeVisible()
  await expect(page.getByText('Due in 13 hours')).toBeVisible()

  // 5: As needed shows no countdown, and last draw still shows.
  await page.getByRole('link', { name: 'BPC-157' }).click()
  await page.getByRole('button', { name: 'Edit schedule' }).click()
  const asNeededEdit = page.getByRole('dialog').filter({ hasText: 'Protocol for BPC-157' })
  await asNeededEdit.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'As needed', exact: true }).click()
  await asNeededEdit.getByRole('button', { name: 'Save' }).click()
  await expect(asNeededEdit).toBeHidden()
  await expect(page.getByText('As needed')).toBeVisible()
  await expect(page.getByText(/Last: 250 mcg/)).toBeVisible()
  await expect(page.locator('.dose-countdown')).toHaveCount(0)

  await page.getByRole('link', { name: 'Today', exact: true }).first().click()
  await expect(page.getByText('As needed')).toBeVisible()
  await expect(page.getByText(/Last: 250 mcg/)).toBeVisible()

  // 6: Offline reload keeps the schedule (Chromium only, matching app.spec.ts).
  if (browserName !== 'webkit') {
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('As needed')).toBeVisible()
    await context.setOffline(false)
  }
})
