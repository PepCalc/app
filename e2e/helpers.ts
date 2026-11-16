import { expect, type Locator, type Page } from '@playwright/test'
import { DISCLAIMER_TITLE } from './app-helpers'

/**
 * Accept the first-run notice. The dialog closes only once the acceptance is on disk, so its
 * button disappearing is the point after which a reload keeps it accepted.
 */
export async function acceptDisclaimer(page: Page) {
  const dialog = page.getByRole('dialog', { name: DISCLAIMER_TITLE })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: "I'm 18 or older and understand" }).click()
  await expect(page.getByRole('button', { name: "I'm 18 or older and understand" })).toBeHidden()
}

/**
 * The first service worker activates without claiming the page that registered it, so wait for
 * activation and reload once: from then on every request goes through the precache.
 */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
}

/** Press the button named `value` in the toggle group named `group`. */
export async function choose(page: Page | Locator, group: string, value: string) {
  await page
    .getByRole('group', { name: group })
    .getByRole('button', { name: value, exact: true })
    .click()
}

export interface UnitChoices {
  weight?: 'kg' | 'lb'
  height?: 'cm' | 'ftin'
}

const WEIGHT_LABELS = { kg: 'Kilograms', lb: 'Pounds' } as const
const HEIGHT_LABELS = { cm: 'Centimetres', ftin: 'Feet and inches' } as const

/** Opens Settings, chooses the requested body units, and returns to the previous screen. */
export async function chooseUnits(page: Page, choices: UnitChoices) {
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  if (choices.weight) await choose(page, 'Weight unit', WEIGHT_LABELS[choices.weight])
  if (choices.height) await choose(page, 'Height unit', HEIGHT_LABELS[choices.height])
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeHidden()
}
