import { expect, test, type Locator, type Page } from '@playwright/test'
import { acceptDisclaimer, choose } from './helpers'

async function openTab(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).first().click()
}

/** `when` is a datetime-local value; the default, now, is to the minute, so two quick logs tie. */
async function logWeight(page: Page, value: string, when?: string) {
  await page.getByRole('button', { name: 'Log weight' }).click()
  const dialog = page.getByRole('dialog', { name: 'Weigh-in' })
  await dialog.getByLabel('Weight').fill(value)
  if (when) await dialog.getByLabel('When').fill(when)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Weight logged')).toBeVisible()
  await expect(dialog).toBeHidden()
}

/** A real image, so the canvas re-encode and the blob: previews run as on a phone. */
async function makePng(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 300
      canvas.height = 400
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#3f6b52'
      ctx.fillRect(0, 0, 300, 400)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
    'base64',
  )
}

/** Saves a photo from the library, keeping the time the dialog suggests. */
async function addPhoto(page: Page, png: Buffer, name: string) {
  await page
    .locator('input[type="file"][aria-label="Choose a photo"]')
    .setInputFiles({ name, mimeType: 'image/png', buffer: png })
  const dialog = page.getByRole('dialog', { name: 'Progress photo' })
  await expectDecoded(dialog.getByRole('img', { name: 'Your progress photo' }))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Photo saved')).toBeVisible()
  await expect(dialog).toBeHidden()
}

/** Decoded, not just present: the production CSP must allow the blob: image. */
async function expectDecoded(img: Locator) {
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBeGreaterThan(0)
}

test.beforeEach(async ({ page }) => {
  // Take the download path on every browser: a share sheet cannot be driven from a test.
  await page.addInitScript(() => {
    delete (navigator as { canShare?: unknown }).canShare
  })
  await page.goto('./')
  await acceptDisclaimer(page)
})

test('logs weight, derives BMI from the profile height, and converts units', async ({ page }) => {
  await openTab(page, 'Journal')
  await logWeight(page, '81.3', '2026-10-01T08:00')
  await expect(page.getByText('Add your height in Settings to see your BMI.')).toBeVisible()

  await openTab(page, 'Settings')
  await page.getByRole('spinbutton', { name: 'Height' }).fill('175')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible()
  await choose(page, 'Weight unit', 'Pounds')

  await openTab(page, 'Journal')
  await expect(page.getByTestId('journal-weight')).toHaveText('179.2 lb')
  // 81.3 / 1.75² = 26.5, whatever unit the weight is shown in.
  await expect(page.getByTestId('journal-bmi')).toContainText('26.5')
  await expect(page.getByTestId('journal-bmi')).toContainText('Above the healthy range')

  await logWeight(page, '177', '2026-10-08T08:00')
  await expect(page.getByText(/−2\.2 lb/)).toBeVisible()
  await page.getByRole('tab', { name: /Weights/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '177 lb' })).toBeVisible()

  await openTab(page, 'Settings')
  await choose(page, 'Weight unit', 'Kilograms')
  await openTab(page, 'Journal')
  await page.getByRole('tab', { name: /Weights/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '81.3 kg' })).toBeVisible()
})

test('logs side effects and blood sugar, in the units chosen in Settings', async ({ page }) => {
  await openTab(page, 'Journal')
  await page.getByRole('button', { name: 'Log side effect' }).click()
  const effects = page.getByRole('dialog', { name: 'Side effects' })
  await effects.getByRole('button', { name: 'Joint pain' }).click()
  await effects.getByRole('button', { name: 'Nausea' }).click()
  await choose(effects, 'How strong', 'Moderate')
  await effects.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Side effects logged')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Side effects this week' })).toContainText(
    'Joint pain',
  )

  await page.getByRole('button', { name: 'Log blood sugar' }).click()
  const sugar = page.getByRole('dialog', { name: 'Blood sugar' })
  await sugar.getByLabel('HbA1c').fill('7.2')
  await sugar.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Reading logged')).toBeVisible()
  await expect(page.getByText('HbA1c 7.2%').first()).toBeVisible()

  await openTab(page, 'Settings')
  await choose(page, 'HbA1c unit', 'mmol/mol')
  await openTab(page, 'Journal')
  await expect(page.getByText('HbA1c 55 mmol/mol').first()).toBeVisible()

  await page.getByRole('tab', { name: /Side effects/ }).click()
  // The entry's title alone; the week's badge reads "Joint pain × 1".
  await expect(page.getByText('Joint pain', { exact: true })).toBeVisible()
})

test('shares a weight trend as an image without revealing the weight', async ({ page }) => {
  await openTab(page, 'Journal')
  await logWeight(page, '100', '2026-10-01T08:00')
  await logWeight(page, '98', '2026-10-08T08:00')

  await page.getByRole('button', { name: 'Share weight as an image' }).click()
  const share = page.getByRole('dialog', { name: 'Share as an image' })
  await expectDecoded(share.getByRole('img', { name: 'Preview of the image to share' }))
  await expect(share.getByText('Only the percent change is shown.')).toBeVisible()
  const image = page.waitForEvent('download')
  await share.getByRole('button', { name: 'Share' }).click()
  expect((await image).suggestedFilename()).toMatch(/^pepcalc-weight-\d{4}-\d{2}-\d{2}\.png$/)
})

test('saves photos, pins them to the weight line, shares a collage, and backs them up', async ({
  page,
}) => {
  await openTab(page, 'Journal')
  await logWeight(page, '100')
  const png = await makePng(page)
  for (const name of ['one.png', 'two.png', 'three.png']) await addPhoto(page, png, name)
  await expect(page.getByRole('button', { name: /^Front photo from / })).toHaveCount(3)
  await expect(
    page.getByRole('img', { name: /3 progress photos pinned to the line/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Compare' }).click()
  const compare = page.getByRole('dialog', { name: 'Compare' })
  for (const img of await compare.getByRole('img', { name: /^Progress photo from / }).all()) {
    await expectDecoded(img)
  }
  await compare.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Share collage' }).click()
  const collage = page.getByRole('dialog', { name: 'Share a collage' })
  const preview = collage.getByRole('img', { name: 'Preview of the image to share' })
  await expectDecoded(preview)
  await choose(collage, 'Shape', 'Story')
  await expect
    .poll(() =>
      preview.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight].join('x')),
    )
    .toBe('1080x1920')
  const shared = page.waitForEvent('download')
  await collage.getByRole('button', { name: 'Share' }).click()
  expect((await shared).suggestedFilename()).toMatch(/^pepcalc-photos-\d{4}-\d{2}-\d{2}\.png$/)
  await expect(collage).toBeHidden()

  await openTab(page, 'Settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save a backup' }).click()
  const backup = await download
  expect(backup.suggestedFilename()).toMatch(/^pepcalc-backup-\d{4}-\d{2}-\d{2}\.zip$/)

  // Change the data, then restore: the backup's three photos and weigh-in come back.
  await openTab(page, 'Journal')
  await page
    .getByRole('button', { name: /^Front photo from / })
    .first()
    .click()
  const photo = page.getByRole('dialog', { name: 'Progress photo' })
  await photo.getByRole('button', { name: 'Delete photo' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Front photo from / })).toHaveCount(2)

  await openTab(page, 'Settings')
  await page.getByLabel('Backup file').setInputFiles((await backup.path())!)
  await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByText('Backup restored')).toBeVisible()
  await openTab(page, 'Journal')
  await expect(page.getByRole('button', { name: /^Front photo from / })).toHaveCount(3)
  await expect(page.getByTestId('journal-weight')).toHaveText('100 kg')
})

test('exports the journal as a PDF with only the chosen parts', async ({ page }) => {
  await openTab(page, 'Journal')
  await logWeight(page, '92', '2026-10-01T08:00')
  await logWeight(page, '90.5', '2026-10-08T08:00')
  await page.getByRole('button', { name: 'Log side effect' }).click()
  const effects = page.getByRole('dialog', { name: 'Side effects' })
  await effects.getByRole('button', { name: 'Nausea' }).click()
  await effects.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('list', { name: 'Side effects this week' })).toContainText('Nausea')

  await page.getByRole('button', { name: 'Export PDF' }).click()
  const report = page.getByRole('dialog', { name: 'Export report' })
  await choose(report, 'Period', 'All')
  // Nothing was drawn, so the draw log cannot be chosen.
  await expect(report.getByRole('checkbox', { name: /^Draw log/ })).toBeDisabled()
  await report.getByRole('checkbox', { name: /^Side effects/ }).uncheck()
  const download = page.waitForEvent('download')
  await report.getByRole('button', { name: 'Export PDF' }).click()
  const file = await download
  const text = Buffer.concat(await (await file.createReadStream()).toArray()).toString('latin1')
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  for (const shown of ['(Journal)', '(Combined chart)', '(Weight)', '(Weight \\(kg\\))'])
    expect(text).toContain(shown)
  // Left out everywhere, the combined chart's rows of events included.
  expect(text).not.toContain('(Side effects)')
  expect(text).not.toContain('(Draw log)')
  await expect(report).toBeHidden()
})

test('two photos in different poses still make a collage', async ({ page }) => {
  await openTab(page, 'Journal')
  const png = await makePng(page)
  await addPhoto(page, png, 'front.png')
  await page
    .locator('input[type="file"][aria-label="Choose a photo"]')
    .setInputFiles({ name: 'side.png', mimeType: 'image/png', buffer: png })
  const dialog = page.getByRole('dialog', { name: 'Progress photo' })
  await choose(dialog, 'Pose', 'Side')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'Share collage' }).click()
  const collage = page.getByRole('dialog', { name: 'Share a collage' })
  await expectDecoded(collage.getByRole('img', { name: 'Preview of the image to share' }))
  await expect(collage.getByRole('button', { name: 'Share' })).toBeEnabled()
  // With only two photos there is no span to choose.
  await expect(collage.getByRole('combobox', { name: 'From' })).toHaveCount(0)
  await collage.getByRole('button', { name: 'Cancel' }).click()

  // Choosing the right-hand photo on the left swaps the two, so one photo never shows twice.
  await page.getByRole('button', { name: 'Compare' }).click()
  const compare = page.getByRole('dialog', { name: 'Compare' })
  // The field, not its input, shows the chosen photo.
  const left = compare.locator('.v-select', { hasText: 'Photo on the left' })
  const right = compare.locator('.v-select', { hasText: 'Photo on the right' })
  // Both photos were taken this minute, so either may open on the left.
  await expect(left).toContainText(/Front|Side/)
  const [was, other] = (await left.textContent())!.includes('Front')
    ? ['Front', 'Side']
    : ['Side', 'Front']
  await expect(right).toContainText(other)
  await left.click()
  await page.getByRole('option', { name: new RegExp(`· ${other}$`) }).click()
  await expect(left).toContainText(other)
  await expect(right).toContainText(was)
})

test('crops a new photo before saving it', async ({ page }) => {
  await openTab(page, 'Journal')
  const png = await makePng(page)
  await page
    .locator('input[type="file"][aria-label="Choose a photo"]')
    .setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: png })
  const dialog = page.getByRole('dialog', { name: 'Progress photo' })
  const image = dialog.getByRole('img', { name: 'Your progress photo' })
  const size = () =>
    image.evaluate(
      (el: HTMLImageElement) => el.complete && `${el.naturalWidth}x${el.naturalHeight}`,
    )
  await expect.poll(size).toBe('300x400')

  await dialog.getByRole('button', { name: 'Crop' }).click()
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
  await choose(dialog, 'Shape', 'Square')
  await dialog.getByRole('button', { name: 'Apply crop' }).click()
  await expect.poll(size).toBe('300x300')

  await dialog.getByRole('button', { name: 'Undo crop' }).click()
  await expect.poll(size).toBe('300x400')

  // Dragging a corner resizes the frame; dragging inside a full frame has nowhere to go.
  const drag = async (target: Locator, dx: number, dy: number) => {
    const box = (await target.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 6 })
    await page.mouse.up()
  }
  await dialog.getByRole('button', { name: 'Crop' }).click()
  await drag(dialog.getByRole('group', { name: /^Crop frame/ }), 40, 40)
  await dialog.getByRole('button', { name: 'Apply crop' }).click()
  await expect.poll(size).toBe('300x400')
  await dialog.getByRole('button', { name: 'Crop' }).click()
  await drag(dialog.locator('.cropper__handle--se'), -60, -60)
  await dialog.getByRole('button', { name: 'Apply crop' }).click()
  await expect
    .poll(() =>
      image.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth < 300 && el.naturalHeight < 400,
      ),
    )
    .toBe(true)
  await dialog.getByRole('button', { name: 'Undo crop' }).click()
  await expect.poll(size).toBe('300x400')

  await dialog.getByRole('button', { name: 'Crop' }).click()
  await dialog.getByRole('group', { name: /^Crop frame/ }).focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowLeft')
  await dialog.getByRole('button', { name: 'Apply crop' }).click()
  await expect.poll(size).toBe('240x400')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Photo saved')).toBeVisible()
})
