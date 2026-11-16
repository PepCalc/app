import { expect, type Page } from '@playwright/test'

export const DISCLAIMER_TITLE = 'For research and education only'
export const UNITS_CARD_TITLE = 'Units'
export const TIMELINE_HASH = 'journal'

export const DOSE_KIND = {
  row: 'Draw',
  plural: 'Draws',
  expectedTitle: '0.25 mg Semaglutide',
  updatedTitle: '0.5 mg Semaglutide',
} as const

/** Opens the screen whose empty state shows the active body-unit summary. */
export async function openUnitsScreen(page: Page) {
  await page.getByRole('link', { name: 'Journal', exact: true }).first().click()
}

/** Ensures a vial exists so Log -> Draw can be logged from the first screen. */
export async function prepareDoseTarget(page: Page) {
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
