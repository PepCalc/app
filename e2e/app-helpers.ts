import type { Page } from '@playwright/test'

export const DISCLAIMER_TITLE = 'For research and education only'
export const UNITS_CARD_TITLE = 'Units'

/** Opens the screen whose empty state shows the active body-unit summary. */
export async function openUnitsScreen(page: Page) {
  await page.getByRole('link', { name: 'Journal', exact: true }).first().click()
}
