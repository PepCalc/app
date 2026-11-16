import { expect, test, type Page } from '@playwright/test'
import { EXPORT_DIALOG, LEGACY_PROGRESS_ROUTE } from './app-helpers'
import { acceptDisclaimer, choose, chooseUnits, waitForServiceWorker } from './helpers'

function localInputValue(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`
}

async function logWeightAt(page: Page, kg: string, daysAgo: number) {
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Log' })
    .getByRole('button', { name: 'Weight', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Weigh-in' })
  await dialog.getByLabel('Weight').fill(kg)
  await dialog.getByLabel('When').fill(localInputValue(daysAgo))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()
  await expect(dialog).toBeHidden()
}

test('shows stat tiles, zooms trend by range, navigates entries, redirects legacy link, and exports offline', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('./')
  await acceptDisclaimer(page)
  await chooseUnits(page, { weight: 'kg' })

  await logWeightAt(page, '90', 95)
  await logWeightAt(page, '85', 20)
  await logWeightAt(page, '82', 2)

  await page.getByRole('link', { name: 'Progress', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible()

  const totalTile = page.locator('.stat-tile', { hasText: 'Total change' })
  const percentTile = page.locator('.stat-tile', { hasText: 'Percent' })
  const weeklyTile = page.locator('.stat-tile', { hasText: 'Weekly average' })
  await expect(totalTile).toContainText('−8 kg')
  await expect(percentTile).toContainText('−8.9%')
  await expect(weeklyTile).toContainText(/−0\.[56] kg/)

  const allChart = page.getByRole('img', { name: /^Weight from 90 kg to 82 kg, .+, 3 entries\./ })
  await expect(allChart).toBeVisible()
  const allLabel = await allChart.getAttribute('aria-label')

  await choose(page, 'Range', '1M')
  const oneMonthChart = page.getByRole('img', {
    name: /^Weight from 85 kg to 82 kg, .+, 2 entries\./,
  })
  await expect(oneMonthChart).toBeVisible()
  const oneMonthLabel = await oneMonthChart.getAttribute('aria-label')
  expect(oneMonthLabel).not.toBe(allLabel)

  await page.getByRole('link', { name: /^All entries/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'All entries' })).toBeVisible()
  await expect(page.locator('.entries-timeline .entry-row')).toHaveCount(3)
  await page.getByRole('link', { name: 'Progress', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible()

  await page.goto(`./#/${LEGACY_PROGRESS_ROUTE.hash}`)
  await expect(
    page.getByRole('heading', { level: 1, name: LEGACY_PROGRESS_ROUTE.heading }),
  ).toBeVisible()

  if (browserName !== 'webkit') {
    await page.goto('./#/progress')
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: 'Export PDF' }).click()
    const report = page.getByRole('dialog', { name: EXPORT_DIALOG.title })
    await choose(report, 'Period', 'All')
    const download = page.waitForEvent('download')
    await report.getByRole('button', { name: EXPORT_DIALOG.submit, exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(
      new RegExp(`^${EXPORT_DIALOG.filePrefix}\\d{4}-\\d{2}-\\d{2}\\.pdf$`),
    )
    const bytes = Buffer.from(await (await file.createReadStream()).toArray().then(Buffer.concat))
    expect(bytes.toString('latin1').startsWith('%PDF-1.4')).toBe(true)
    await context.setOffline(false)
  }
})
