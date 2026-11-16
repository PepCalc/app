import { expect, test } from '@playwright/test'
import { acceptDisclaimer, choose } from './helpers'

test('manages a peptide on Stack, keeps levels off VialView, and supports redirects and Compare levels', async ({
  page,
}) => {
  await page.goto('./#/calculator')
  await acceptDisclaimer(page)

  // Save Semaglutide and Tirzepatide vials.
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await expect(page.getByText('From your shelf')).toBeVisible()

  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: /^Semaglutide/ }).click()
  await expect(page.getByRole('heading', { name: 'Semaglutide' })).toBeVisible()

  // Set a weekly schedule and log a draw from the peptide page.
  await page.getByRole('button', { name: 'Add a schedule' }).click()
  const proto = page.getByRole('dialog').filter({ hasText: 'Add a protocol' })
  await proto.locator('.v-select').filter({ hasText: 'How often' }).click()
  await page.getByRole('option', { name: 'Every N hours', exact: true }).click()
  await proto.getByLabel('Every', { exact: true }).fill('7')
  await proto.locator('.v-select').filter({ hasText: 'Unit' }).click()
  await page.getByRole('option', { name: 'days', exact: true }).click()
  await proto.getByRole('button', { name: 'Save' }).click()
  await expect(proto).toBeHidden()

  await page.getByRole('button', { name: 'Log a draw' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Log draw' }).click()
  await expect(page.getByText(/Logged 0.25 mg of Semaglutide/)).toBeVisible()

  await expect(page.getByText('Due in 7 days')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Estimated amount in the body now:/ })).toHaveCount(1)
  await expect(page.getByText('0.25 mg Semaglutide')).toBeVisible()

  // VialView has no level chart and links back to the peptide page.
  const vialLink = page.getByRole('link', { name: /Semaglutide/ }).first()
  const vialHref = await vialLink.getAttribute('href')
  const vialId = vialHref!.split('/').pop()!
  await vialLink.click()
  await expect(page.getByText("Levels are on the peptide's page.")).toBeVisible()
  await expect(page.getByRole('img', { name: /^Estimated amount in the body now:/ })).toHaveCount(0)

  // Legacy redirects land on the new pages.
  await page.goto('./#/shelf')
  await expect(page).toHaveURL(/#\/stack$/)
  await page.goto('./#/protocols')
  await expect(page).toHaveURL(/#\/stack$/)
  await page.goto(`./#/shelf/${vialId}`)
  await expect(page).toHaveURL(new RegExp(`#/stack/vial/${vialId}$`))

  // Add a second peptide to compare levels, then archive the first vial.
  await page.goto('./#/calculator')
  await expect(page.getByRole('button', { name: 'Save vial to shelf' })).toBeVisible()
  await page.locator('.v-select').first().click()
  await page
    .getByRole('option', { name: /Tirzepatide/ })
    .first()
    .click()
  await choose(page, 'Dose', '2.5 mg')
  await page.getByRole('button', { name: 'Save vial to shelf' }).click()
  await page.getByRole('button', { name: 'Log this draw now' }).click()
  await expect(page.getByText(/Logged 2.5 mg of Tirzepatide/)).toBeVisible()

  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await page.getByRole('link', { name: 'Compare levels' }).click()
  await expect(page).toHaveURL(/#\/stack\/levels$/)
  await expect(page.getByRole('img', { name: /each scaled to its own peak/ })).toBeVisible()

  // Archive Semaglutide's vial and verify it moves under Archived on Stack.
  await page.goto(`./#/stack/vial/${vialId}`)
  await page.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('link', { name: 'Stack', exact: true }).first().click()
  await expect(page.getByRole('button', { name: /Show archived \(1\)/ })).toBeVisible()
})
