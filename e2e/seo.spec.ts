import { expect, test } from '@playwright/test'
import { acceptDisclaimer } from './helpers'

test('serves crawlers a readable page that the app replaces when it starts', async ({
  page,
  request,
}) => {
  const html = await (await request.get('./')).text()
  expect(html).toContain('<link rel="canonical" href="https://pepcalc.github.io/app/"')
  expect(html).toContain('property="og:image" content="https://pepcalc.github.io/app/og.png"')
  expect(html).toContain('"@type":"WebApplication"')
  expect(html).toContain('<h1>PepCalc: peptide reconstitution calculator</h1>')
  expect((await request.get('./og.png')).ok()).toBe(true)
  // Link previews fetch the share image; installs need not precache it.
  expect(await (await request.get('./sw.js')).text()).not.toContain('og.png')

  const violations: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
  })
  await page.goto('./')
  await acceptDisclaimer(page)
  await expect(page.locator('.pc-shell')).toHaveCount(0)
  expect(violations).toEqual([])
})
