import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { acceptDisclaimer, choose } from './helpers'

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

test('Add reminder shows Notify me disabled on the web and calendar invite enabled', async ({
  page,
}) => {
  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  await page.getByRole('button', { name: 'Add reminder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add reminder' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Notify me/ })).toBeDisabled()
  await expect(dialog.getByText('Needs the PepCalc app for Android')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Add calendar invite/ })).toBeEnabled()
})

test('weekly schedule downloads an .ics with BYDAY', async ({ page }) => {
  await page.addInitScript(() => {
    delete (navigator as { canShare?: unknown }).canShare
  })
  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()

  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Chosen days', exact: true }).click()
  const days = proto.getByRole('group', { name: 'Days' })
  await days.getByRole('button', { name: 'Monday' }).click()
  await days.getByRole('button', { name: 'Wednesday' }).click()
  await proto.getByLabel('Time 1').fill('08:30')
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  await page.getByRole('button', { name: 'Add reminder' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Add calendar invite/ }).click()
  await expect(page.getByRole('dialog', { name: 'Calendar invite' })).toBeVisible()

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download calendar invite' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^pepcalc-dose-\d{4}-\d{2}-\d{2}\.ics$/)
  const ics = await readFile((await file.path())!, 'utf8')
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\n')
})

test('cycle schedule offers the .ics file without Google or Outlook links', async ({ page }) => {
  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()

  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Days on, days off', exact: true }).click()
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  await page.getByRole('button', { name: 'Add reminder' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Add calendar invite/ }).click()
  await expect(dialog.getByRole('button', { name: 'Download calendar invite' })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Google Calendar' })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: 'Outlook.com' })).toHaveCount(0)
})

test('12-hour interval schedule shows the explanation and offers neither file nor links', async ({
  page,
}) => {
  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()

  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await proto.getByLabel('Every').fill('12')
  await proto.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'hours', exact: true }).click()
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  await page.getByRole('button', { name: 'Add reminder' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Add calendar invite/ }).click()
  await expect(
    dialog.getByText(/Calendars can't repeat every 12 hours from your last dose\./),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Download calendar invite' })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: 'Google Calendar' })).toHaveCount(0)
})

test('a reminder link opens Log a draw for its peptide once, and reload does not reopen it', async ({
  page,
}) => {
  await seedBpc157(page)
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^BPC-157/ }).click()
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  const protocolId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('pepcalc')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const read = open.result.transaction('protocols').objectStore('protocols').getAll()
          read.onsuccess = () => resolve((read.result as { id: string }[])[0]!.id)
        }
      }),
  )

  await page.goto(`./#/?log=${protocolId}`)
  const drawDialog = page.getByRole('dialog', { name: 'Log a draw' })
  await expect(drawDialog).toBeVisible()
  await expect(drawDialog).toContainText('BPC-157')
  await expect(page).not.toHaveURL(/log=/)

  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Log a draw' })).toBeHidden()

  await page.goto('./#/?log=not-a-protocol')
  await expect(page).not.toHaveURL(/log=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
