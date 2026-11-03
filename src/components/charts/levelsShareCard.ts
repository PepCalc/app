import { init } from 'echarts/core'
import markUrl from '@/assets/brand/pepcalc-mark.svg'
import type { ChartColors } from '@/composables/useChartColors'
import { formatShort } from '@/services/time'
import { levelsModel, type LevelsInput } from '@/domain/levels'
import { formatAmount } from '@/domain/units'
import { levelsOption } from './levelsChart'

/** What the card says besides the curve. Every figure on it carries its source. */
export interface ShareCardContent {
  input: LevelsInput
  /** Peptide name, or a neutral title when the user leaves the name off. */
  title: string
  halfLife: string
  peakTime: string
  /** Where the half-life and peak time came from, toned like the in-app source badge. */
  source: { text: string; tone: 'good' | 'info' | 'notice' }
  hideAmounts: boolean
  /** When the card was made, already formatted for the device's locale. */
  madeAt: string
}

/** Portrait 4:5, the shape messaging apps and social feeds show without cropping. */
const WIDTH = 1080
const HEIGHT = 1350
const PAD = 72

const TOKENS = [
  'bg',
  'text-1',
  'text-2',
  'text-3',
  'brand',
  'brand-soft',
  'accent',
  'backdrop-1',
  'backdrop-2',
  'glass-card',
  'glass-edge',
  'good-fg',
  'good-bg',
  'info-fg',
  'info-bg',
  'notice-fg',
  'notice-bg',
] as const
type CardTokens = Record<(typeof TOKENS)[number], string>

function readTokens(): CardTokens {
  const style = getComputedStyle(document.querySelector('.v-application') ?? document.body)
  return Object.fromEntries(
    TOKENS.map((t) => [t, style.getPropertyValue(`--pc-${t}`).trim()]),
  ) as CardTokens
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the PepCalc mark'))
    img.src = src
  })
}

/** Greedy word wrap; returns the lines that fit in `maxLines`, the last one ellipsised. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
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
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s+\S*$/, '')}…`
  }
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** A pill like `.pc-badge`; returns the x where the next one starts. */
function badge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fg: string,
  bg: string,
) {
  const w = ctx.measureText(text).width + 40
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, 52, 26)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.fillText(text, x + 20, y + 35)
  return x + w + 14
}

/**
 * Draw the estimated-levels card to a PNG: the PepCalc mark, the peptide, the headline
 * readings, the curve, its half-life and peak time with their source, and the caveat that this
 * is a model, not a blood level. Everything is drawn on the device; nothing leaves it unless
 * the user shares the file. The image carries no metadata beyond its pixels.
 */
export async function renderLevelsCard(
  content: ShareCardContent,
  chartColors: ChartColors,
): Promise<Blob> {
  const t = readTokens()
  const font = chartColors.font
  await Promise.all([
    document.fonts.load(`700 64px ${font}`),
    document.fonts.load(`600 28px ${font}`),
    document.fonts.load(`400 28px ${font}`),
  ])
  const mark = await loadImage(markUrl)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  const inner = WIDTH - PAD * 2

  // Backdrop: the app's paper with its two light pools.
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (const [x, y, r, colour] of [
    [0, 0, 900, t['backdrop-1']],
    [WIDTH, 120, 760, t['backdrop-2']],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, colour)
    g.addColorStop(1, 'transparent')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  // Brand row.
  ctx.drawImage(mark, PAD, PAD, 64, 64)
  ctx.font = `700 38px ${font}`
  ctx.fillStyle = t['text-1']
  ctx.fillText('Pep', PAD + 84, PAD + 45)
  ctx.fillStyle = t.brand
  ctx.fillText('Calc', PAD + 84 + ctx.measureText('Pep').width, PAD + 45)
  ctx.font = `400 26px ${font}`
  ctx.fillStyle = t['text-3']
  ctx.textAlign = 'right'
  ctx.fillText(content.madeAt, WIDTH - PAD, PAD + 43)
  ctx.textAlign = 'left'

  // Title block.
  let y = PAD + 150
  ctx.font = `700 24px ${font}`
  ctx.fillStyle = t.accent
  ctx.letterSpacing = '4px'
  ctx.fillText('ESTIMATED LEVELS', PAD, y)
  ctx.letterSpacing = '0px'
  ctx.font = `700 64px ${font}`
  ctx.fillStyle = t['text-1']
  // One line keeps the layout fixed; catalog names fit, long custom names are ellipsised.
  y += 76
  ctx.fillText(wrap(ctx, content.title, inner, 1)[0] ?? '', PAD, y)

  // Headline readings, mirroring the stats above the in-app chart.
  const model = levelsModel(content.input)
  const { summary } = model
  const unit = content.input.unitLabel
  const stats: [string, string][] = []
  if (!content.hideAmounts) stats.push(['Now', formatAmount(summary.now, unit)])
  if (summary.peak) {
    const label = content.input.preview ? 'Peak with this dose' : 'Peak'
    stats.push([
      label,
      content.hideAmounts ? formatShort(summary.peak.at) : formatAmount(summary.peak.amount, unit),
    ])
  }
  if (summary.clearsAt) stats.push(['Below 10% of peak', formatShort(summary.clearsAt)])
  y += 64
  const column = inner / Math.max(stats.length, 1)
  stats.forEach(([label, value], i) => {
    ctx.font = `600 24px ${font}`
    ctx.fillStyle = t['text-3']
    ctx.fillText(label, PAD + i * column, y)
    ctx.font = `700 40px ${font}`
    ctx.fillStyle = t['text-1']
    ctx.fillText(value, PAD + i * column, y + 50, column - 16)
  })

  // The curve on a glass panel, rendered by the same option builder as the in-app chart.
  y += 92
  const panelH = 560
  ctx.fillStyle = t['glass-card']
  roundRect(ctx, PAD - 24, y, inner + 48, panelH, 36)
  ctx.fill()
  ctx.strokeStyle = t['glass-edge']
  ctx.lineWidth = 2
  ctx.stroke()
  const host = document.createElement('div')
  const chart = init(host, null, {
    renderer: 'canvas',
    width: inner,
    height: panelH - 56,
    devicePixelRatio: 1,
  })
  try {
    chart.setOption(
      levelsOption(content.input, model, chartColors, {
        forImage: true,
        hideAmounts: content.hideAmounts,
      }),
    )
    ctx.drawImage(chart.getRenderedCanvas({ backgroundColor: 'transparent' }), PAD, y + 28)
  } finally {
    chart.dispose()
  }

  // Parameters and their source.
  y += panelH + 40
  ctx.font = `600 26px ${font}`
  let x = PAD
  x = badge(ctx, `t½ ${content.halfLife}`, x, y, t.brand, t['brand-soft'])
  x = badge(ctx, `peak ${content.peakTime}`, x, y, t.brand, t['brand-soft'])
  const { text, tone } = content.source
  badge(ctx, text, x, y, t[`${tone}-fg`], t[`${tone}-bg`])

  // Caveat: the card must not read as a blood level or as advice.
  y += 96
  ctx.font = `400 26px ${font}`
  ctx.fillStyle = t['text-2']
  const caveat =
    'Estimated from logged doses.' +
    (content.input.preview ? ' Dashed line: a draw not yet logged.' : '')
  for (const line of wrap(ctx, caveat, inner, 3)) {
    ctx.fillText(line, PAD, y)
    y += 36
  }

  ctx.font = `600 24px ${font}`
  ctx.fillStyle = t['text-3']
  ctx.fillText('Made with PepCalc', PAD, HEIGHT - PAD + 12)

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
      'image/png',
    ),
  )
}
