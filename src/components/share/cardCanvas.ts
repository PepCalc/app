/**
 * Drawing shared by the share images (a trend card, a photo collage): the app's colours read
 * from its tokens, its paper and backdrop, the brand row and the footer. Everything is drawn on
 * the device; nothing is fetched.
 */

const TOKENS = [
  'bg',
  'text-1',
  'text-2',
  'text-3',
  'brand',
  'accent',
  'backdrop-1',
  'backdrop-2',
  'glass-card',
  'glass-edge',
  'surface',
  'notice-fg',
  'syringe-barrel',
  'syringe-ink',
  'syringe-fill',
  'syringe-fill-deep',
  'syringe-glint',
  'syringe-plunger',
] as const
export type CardTokens = Record<(typeof TOKENS)[number], string>

export function readTokens(): CardTokens {
  const style = getComputedStyle(document.querySelector('.v-application') ?? document.body)
  return Object.fromEntries(
    TOKENS.map((t) => [t, style.getPropertyValue(`--pc-${t}`).trim()]),
  ) as CardTokens
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load an image'))
    img.src = src
  })
}

/** Greedy word wrap to `width`; the last of `maxLines` lines is ellipsised. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = []
  let line = ''
  // Split on plain spaces only, so a no-break space keeps a figure with its unit.
  for (const word of text.split(/[ \t\n]+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/ +[^ ]*$/, '')}…`
  }
  return lines
}

/** The app's paper with its two soft pools of colour. */
export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  width: number,
  height: number,
) {
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, width, height)
  for (const [x, y, r, colour] of [
    [0, 0, 900, t['backdrop-1']],
    [width, 120, 760, t['backdrop-2']],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, colour)
    g.addColorStop(1, 'transparent')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }
}

/** The mark, the two-tone wordmark and the date, across the top. */
export function drawBrandRow(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  font: string,
  mark: HTMLImageElement,
  madeAt: string,
  width: number,
  pad: number,
) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(pad, pad, 64, 64, 14)
  ctx.clip()
  ctx.drawImage(mark, pad, pad, 64, 64)
  ctx.restore()
  ctx.font = `700 40px ${font}`
  ctx.fillStyle = t['text-1']
  ctx.fillText('Pep', pad + 84, pad + 46)
  ctx.fillStyle = t.brand
  ctx.fillText('Calc', pad + 84 + ctx.measureText('Pep').width, pad + 46)
  ctx.font = `400 26px ${font}`
  ctx.fillStyle = t['text-3']
  ctx.textAlign = 'right'
  ctx.fillText(madeAt, width - pad, pad + 44)
  ctx.textAlign = 'left'
}

/** The sign-off line; with `link`, the site's address right-aligned beside it. */
export function drawFooter(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  font: string,
  height: number,
  pad: number,
  link?: { text: string; width: number },
) {
  const y = height - pad + 12
  ctx.font = `600 24px ${font}`
  ctx.fillStyle = t['text-3']
  ctx.fillText('Made with PepCalc · Not medical advice', pad, y)
  if (!link) return
  ctx.font = `700 26px ${font}`
  ctx.fillStyle = t.brand
  ctx.textAlign = 'right'
  ctx.fillText(link.text, link.width - pad, y)
  ctx.textAlign = 'left'
}

export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
      'image/png',
    ),
  )
}
