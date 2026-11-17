import { expect, type Page } from '@playwright/test'

export const DISCLAIMER_TITLE = 'For research and education only'
export const UNITS_CARD_TITLE = 'Units'
export const TIMELINE_HASH = 'progress/entries'
export const LEGACY_PROGRESS_ROUTE = { hash: 'journal', heading: 'Progress' } as const
export const EXPORT_DIALOG = {
  title: 'Export report',
  submit: 'Export PDF',
  filePrefix: 'pepcalc-report-',
} as const
export const EMPTY_TODAY_TITLE = 'Mix your first vial'
export const TODAY_LOG_BUTTON = 'Log a draw'
export const TILE_TARGET = { heading: 'Progress', url: /#\/progress/ } as const

export const DOSE_KIND = {
  row: 'Draw',
  plural: 'Draws',
  expectedTitle: '0.25 mg Semaglutide',
  updatedTitle: '0.5 mg Semaglutide',
} as const

/** Opens the screen whose empty state shows the active body-unit summary. */
export async function openUnitsScreen(_page: Page) {}

/** Ensures a vial exists so Log -> Draw can be logged from the first screen. */
export async function prepareDoseTarget(page: Page) {
  await page.getByRole('link', { name: 'Calculator', exact: true }).first().click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()
}

export async function fillNewDose(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Log a draw' })
  await dialog.getByRole('button', { name: 'Log draw' }).click()
  await expect(page.getByText(/Logged 0\.25 mg of Semaglutide/)).toBeVisible()
}

export async function editDoseEntry(page: Page) {
  await page.getByRole('button', { name: /0\.25 mg Semaglutide/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit draw' })
  await dialog.getByLabel('Dose', { exact: true }).fill('0.5')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Draw updated')).toBeVisible()
}

export async function deleteDoseEntry(page: Page) {
  await page.getByRole('button', { name: /0\.5 mg Semaglutide/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit draw' })
  await dialog.getByRole('button', { name: 'Delete draw' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Draw deleted')).toBeVisible()
}

/** Seeds a vial and weekly schedule from Today's empty state, then returns to Today. */
export async function prepareTodaySchedule(page: Page) {
  await page.getByRole('link', { name: 'Open the calculator' }).click()
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
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

  await page.getByRole('link', { name: 'Today', exact: true }).first().click()
}

/** Saves the first draw from the dialog opened by Today's due card. */
export async function saveDueCardDose(page: Page) {
  await fillNewDose(page)
}

/** Saves the repeated draw without changing the pre-filled amount. */
export async function saveRepeatedDueDose(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Log a draw' })
  await dialog.getByRole('button', { name: 'Log draw' }).click()
  await expect(page.getByText(/Logged 0\.25 mg of Semaglutide/)).toBeVisible()
}

/** Verifies scheduled future days on the calendar with a weekly schedule. */
export async function verifyScheduledCalendar(page: Page) {
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^Semaglutide/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await dialog.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Weekly/Select Days', exact: true }).click()
  await dialog.getByRole('button', { name: 'Wednesday', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Protocol added for Semaglutide')).toBeVisible()

  await page.goto(`./#/${TIMELINE_HASH}?view=calendar`)
  // Nov 16 is Monday; upcoming Wednesday is Nov 18.
  const wednesdayCell = page.locator('[data-v-date="2026-11-18"]')
  await expect(wednesdayCell.locator('.cal-mark--scheduled')).toBeVisible()
  await wednesdayCell.click()
  await expect(page.locator('.day-panel')).toContainText('Scheduled: Semaglutide')
}
