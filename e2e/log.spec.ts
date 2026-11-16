import { expect, test, type Page } from '@playwright/test'
import {
  DOSE_KIND,
  TIMELINE_HASH,
  deleteDoseEntry,
  editDoseEntry,
  fillNewDose,
  prepareDoseTarget,
} from './app-helpers'
import { acceptDisclaimer, chooseUnits, waitForServiceWorker } from './helpers'

async function openLogSheet(page: Page) {
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  return page.getByRole('dialog', { name: 'Log' })
}

async function makePng(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 240
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#2d6567'
      ctx.fillRect(0, 0, 200, 240)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
    'base64',
  )
}

test('logs every kind from the Log sheet, filters, edits, and deletes in the timeline', async ({
  page,
}) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await chooseUnits(page, { weight: 'kg' })
  await prepareDoseTarget(page)

  let sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: DOSE_KIND.row, exact: true }).click()
  await fillNewDose(page)

  sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Weight', exact: true }).click()
  const weight = page.getByRole('dialog', { name: 'Weigh-in' })
  await weight.getByLabel('Weight').fill('82.4')
  await weight.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()

  sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Side effect', exact: true }).click()
  const symptom = page.getByRole('dialog', { name: 'Side effects' })
  await symptom.getByRole('button', { name: 'Nausea' }).click()
  await symptom.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Side effect logged')).toBeVisible()

  sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Blood sugar', exact: true }).click()
  const sugar = page.getByRole('dialog', { name: 'Blood sugar' })
  await sugar.getByLabel('HbA1c').fill('7.2')
  await sugar.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Reading logged')).toBeVisible()

  sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Vitals', exact: true }).click()
  const vitals = page.getByRole('dialog', { name: 'Vitals' })
  await vitals.getByLabel('Systolic').fill('128')
  await vitals.getByLabel('Diastolic').fill('82')
  await vitals.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Reading logged')).toBeVisible()

  const png = await makePng(page)
  const chooserPromise = page.waitForEvent('filechooser')
  sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Photo', exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'front.png', mimeType: 'image/png', buffer: png })
  const photo = page.getByRole('dialog', { name: 'Progress photo' })
  await expect(photo).toBeVisible()
  await photo.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Photo saved')).toBeVisible()

  await page.goto(`./#/${TIMELINE_HASH}`)
  const timeline = page.locator('.entries-timeline')
  for (const title of [
    DOSE_KIND.expectedTitle,
    '82.4 kg',
    'Nausea',
    'HbA1c 7.2%',
    '128/82 mmHg',
    'Front photo',
  ]) {
    await expect(timeline.getByText(title)).toBeVisible()
  }

  await timeline.getByRole('button', { name: /^Weight / }).click()
  await expect(timeline.getByText('82.4 kg')).toBeVisible()
  await expect(timeline.getByText('Nausea')).toBeHidden()
  await timeline.getByRole('button', { name: /^All / }).click()
  await expect(timeline.getByText('Nausea')).toBeVisible()

  await timeline.getByRole('button', { name: /82\.4 kg/ }).click()
  await weight.getByLabel('Weight').fill('81.1')
  await weight.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight updated')).toBeVisible()
  const todayGroup = timeline.locator('.day-group', { hasText: 'Today' })
  await expect(todayGroup.getByText('81.1 kg')).toBeVisible()
  await expect(timeline.getByText('82.4 kg')).toBeHidden()

  await editDoseEntry(page)
  await expect(todayGroup.getByText(DOSE_KIND.updatedTitle)).toBeVisible()

  await timeline.getByRole('button', { name: /81\.1 kg/ }).click()
  await weight.getByRole('button', { name: 'Delete weigh-in' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Weigh-in deleted')).toBeVisible()
  await expect(timeline.getByText('81.1 kg')).toBeHidden()

  await deleteDoseEntry(page)
  await expect(timeline.getByText(DOSE_KIND.updatedTitle)).toBeHidden()
})

test('logs a weight offline and keeps it in the timeline after reload', async ({
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
  await chooseUnits(page, { weight: 'kg' })

  await context.setOffline(true)
  const sheet = await openLogSheet(page)
  await sheet.getByRole('button', { name: 'Weight', exact: true }).click()
  const weight = page.getByRole('dialog', { name: 'Weigh-in' })
  await weight.getByLabel('Weight').fill('80.5')
  await weight.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()

  await page.goto(`./#/${TIMELINE_HASH}`)
  await page.reload()
  await expect(page.locator('.entries-timeline').getByText('80.5 kg')).toBeVisible()
  await context.setOffline(false)
})
