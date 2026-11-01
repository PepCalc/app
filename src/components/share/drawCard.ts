import markUrl from '@/assets/brand/pepcalc-mark.svg'
import { readSyringe, syringeTicks, toScale, type SyringeSpec } from '@/domain/syringe'
import { roundTo } from '@/domain/units'
import {
  drawBrandRow,
  drawFooter,
  loadImage,
  paintBackdrop,
  readTokens,
  toPng,
  wrap,
  type CardTokens,
} from './cardCanvas'

/** What the draw card shows. Every value is already formatted the way the calculator shows it. */
export interface DrawCardContent {
  /** Peptide name, or a neutral title when the user leaves the name off. */
  title: string
  /** "10 mg" */
  vial: string
  /** "2 mL" */
  water: string
  /** "5 mg/mL (5000 mcg/mL)" */
  concentration: string
  dosesPerVial: number
  /** "250 mcg" */
  dose: string
  /** The reading on the barrel, split so the number can be large: { '5', 'units' }. */
  draw: { value: string; unit: string }
  /** "0.05 mL" */
  volume: string
  syringe: SyringeSpec
  volumeMl: number
  /** A blend's share of the draw: "BPC-157 250 mcg". Empty for a single peptide. */
  components: string[]
  /** Short warnings about this draw: more than the vial holds, or the syringe cannot measure it. */
  warnings: string[]
  /** "4.5 units (5% off)" when the reading falls between marks; null when it is on one. */
  nearestMark: string | null
  /** When the card was made, formatted for the device's locale. */
  madeAt: string
}

/** Portrait 4:5, the shape messaging apps show without cropping. */
const WIDTH = 1080
const HEIGHT = 1350
const PAD = 72
/** Lines of notes that fit between the syringe panel and the footer. */
const NOTE_LINES = 3

/** Shown without the scheme or trailing slash: "pepcalc.github.io". */
const SITE = __SITE_URL__.replace(/^https?:\/\//, '').replace(/\/$/, '')

/**
 * Draw the reconstitution and draw card to a PNG: the PepCalc mark, the peptide, how much is in
 * the vial and how much water to add, how much to draw for the dose entered, that draw on the
 * chosen syringe, and the site's address. Drawn on the device; it leaves only through the share
 * sheet or a download the user starts, and carries no metadata beyond its pixels.
 */
export async function renderDrawCard(content: DrawCardContent): Promise<Blob> {
  const t = readTokens()
  const style = getComputedStyle(document.querySelector('.v-application') ?? document.body)
  const font = style.getPropertyValue('--pc-font').trim() || 'sans-serif'
  const mono = style.getPropertyValue('--pc-font-mono').trim() || 'monospace'
  await Promise.all([
    document.fonts.load(`700 64px ${font}`),
    document.fonts.load(`600 28px ${font}`),
    document.fonts.load(`400 28px ${font}`),
    document.fonts.load(`500 22px ${mono}`),
  ])
  const mark = await loadImage(markUrl)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  const inner = WIDTH - PAD * 2

  paintBackdrop(ctx, t, WIDTH, HEIGHT)
  drawBrandRow(ctx, t, font, mark, content.madeAt, WIDTH, PAD)

  // Title block.
  let y = PAD + 150
  ctx.font = `700 24px ${font}`
  ctx.fillStyle = t.accent
  ctx.letterSpacing = '4px'
  ctx.fillText('RECONSTITUTION & DOSE', PAD, y)
  ctx.letterSpacing = '0px'
  ctx.font = `700 64px ${font}`
  ctx.fillStyle = t['text-1']
  y += 76
  // One line keeps the layout fixed; catalog names fit, long custom names are ellipsised.
  ctx.fillText(wrap(ctx, content.title, inner, 1)[0] ?? '', PAD, y)

  // The mix: what is in the vial and the water that goes in, on a glass panel.
  y += 44
  const mixH = 210
  glassPanel(ctx, t, PAD - 24, y, inner + 48, mixH)
  const half = inner / 2
  const mixItems: [string, string][] = [
    ['Peptide in vial', content.vial],
    ['BAC water to add', content.water],
  ]
  mixItems.forEach(([label, value], i) => {
    const x = PAD + 16 + i * (half + 32)
    ctx.font = `600 24px ${font}`
    ctx.fillStyle = t['text-3']
    ctx.fillText(label, x, y + 58)
    ctx.font = `700 60px ${font}`
    ctx.fillStyle = t['text-1']
    ctx.fillText(value, x, y + 124, half - 56)
  })
  // A plus between the two, reading as "this, plus this water".
  const plusX = PAD + half + 8
  // Centred on the figures' ink, not their line box, so it sits level with "2 mL".
  ctx.font = `700 60px ${font}`
  const plusY = y + 124 - ctx.measureText(content.water).actualBoundingBoxAscent / 2
  ctx.fillStyle = t.surface
  ctx.beginPath()
  ctx.arc(plusX, plusY, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = t['glass-edge']
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = t.brand
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(plusX - 10, plusY)
  ctx.lineTo(plusX + 10, plusY)
  ctx.moveTo(plusX, plusY - 10)
  ctx.lineTo(plusX, plusY + 10)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.font = `400 26px ${font}`
  ctx.fillStyle = t['text-2']
  ctx.fillText(
    `Makes ${content.concentration} · ${content.dosesPerVial} doses per vial`,
    PAD + 16,
    y + mixH - 32,
    inner - 32,
  )

  // The draw: the reading in the syringe's own scale, large, then its volume and the dose.
  y += mixH + 74
  ctx.font = `700 24px ${font}`
  ctx.fillStyle = t.accent
  ctx.letterSpacing = '4px'
  ctx.fillText(`DRAW FOR A ${content.dose.toUpperCase()} DOSE`, PAD, y, inner)
  ctx.letterSpacing = '0px'
  y += 148
  ctx.font = `700 156px ${font}`
  ctx.fillStyle = t['text-1']
  ctx.letterSpacing = '-4px'
  ctx.fillText(content.draw.value, PAD - 6, y)
  const valueW = ctx.measureText(content.draw.value).width
  ctx.letterSpacing = '0px'
  ctx.font = `600 48px ${font}`
  ctx.fillText(content.draw.unit, PAD + valueW + 14, y)
  y += 52
  ctx.font = `400 28px ${font}`
  ctx.fillStyle = t['text-2']
  const volumeLine =
    content.draw.unit === 'mL'
      ? `on a ${content.syringe.label}`
      : `${content.volume} on a ${content.syringe.label}`
  ctx.fillText(volumeLine, PAD, y, inner)

  // The draw on the chosen syringe.
  y += 30
  const syringeH = 250
  glassPanel(ctx, t, PAD - 24, y, inner + 48, syringeH)
  // The drawing's ink spans viewBox rows 10 to 116; centre that band in the panel.
  const scale = (inner + 12) / VIEW_W
  const syringeTop = y + (syringeH - 106 * scale) / 2 - 10 * scale
  drawSyringe(
    ctx,
    t,
    font,
    mono,
    content.syringe,
    content.volumeMl,
    PAD - 6,
    syringeTop,
    inner + 12,
  )

  // Below the syringe, most important first, in the room above the footer: warnings, the
  // nearest mark when the reading falls between marks, a blend's contents, and the reminder to
  // check the label. Each is ellipsised rather than cut silently.
  y += syringeH + 46
  const blocks: { text: string; weight: number; colour: string }[] = [
    ...content.warnings.map((text) => ({ text, weight: 600, colour: t['notice-fg'] })),
    ...(content.nearestMark
      ? [{ text: `Nearest mark: ${content.nearestMark}`, weight: 600, colour: t['text-2'] }]
      : []),
    ...(content.components.length
      ? [
          {
            text: `This draw contains ${content.components.join(' · ')}.`,
            weight: 400,
            colour: t['text-2'],
          },
        ]
      : []),
    {
      text: "Calculated from the values entered. Check them against your vial's label.",
      weight: 400,
      colour: t['text-2'],
    },
  ]
  let room = NOTE_LINES
  for (const block of blocks) {
    if (room === 0) break
    ctx.font = `${block.weight} 26px ${font}`
    ctx.fillStyle = block.colour
    for (const line of wrap(ctx, block.text, inner, room)) {
      ctx.fillText(line, PAD, y)
      y += 36
      room--
    }
  }

  // A hairline above the footer separates the sign-off from the figures.
  ctx.strokeStyle = t['glass-edge']
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, HEIGHT - PAD - 34)
  ctx.lineTo(WIDTH - PAD, HEIGHT - PAD - 34)
  ctx.stroke()
  drawFooter(ctx, t, font, HEIGHT, PAD, { text: SITE, width: WIDTH })
  return toPng(canvas)
}

function glassPanel(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = t['glass-card']
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 36)
  ctx.fill()
  ctx.strokeStyle = t['glass-edge']
  ctx.lineWidth = 2
  ctx.stroke()
}

// The in-app drawing's geometry (SyringeGraphic.vue), in its viewBox units.
const VIEW_W = 640
const BARREL_X = 78
const BARREL_W = 470
const BARREL_Y = 38
const BARREL_H = 52
const MID_Y = BARREL_Y + BARREL_H / 2
const STOPPER_W = 12
const TICK_LENGTH = { major: 20, half: 14, minor: 8 } as const

/**
 * The syringe as the calculator draws it, at rest at the reading: barrel, liquid, stopper and
 * plunger, graduations, and the dashed line with the reading flag. Drawn with canvas paths
 * rather than by rasterising the SVG, whose colours live in scoped CSS.
 */
function drawSyringe(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  font: string,
  mono: string,
  syringe: SyringeSpec,
  volumeMl: number,
  left: number,
  top: number,
  width: number,
) {
  const reading = readSyringe(volumeMl, syringe)
  const fillX = BARREL_X + BARREL_W * Math.min(1, volumeMl / syringe.capacityMl)
  const scaleName = syringe.unitsPerMl === null ? 'mL' : 'units'
  const capacity = roundTo(toScale(syringe.capacityMl, syringe), 3)

  ctx.save()
  ctx.translate(left, top)
  ctx.scale(width / VIEW_W, width / VIEW_W)

  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string | CanvasGradient,
  ) => {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(x, y, Math.max(0, w), h, r)
    ctx.fill()
  }

  // Needle and hub.
  ctx.strokeStyle = t['syringe-plunger']
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(8, MID_Y)
  ctx.lineTo(BARREL_X - 16, MID_Y)
  ctx.stroke()
  ctx.lineCap = 'butt'
  rect(BARREL_X - 18, MID_Y - 9, 18, 18, 3, t['syringe-plunger'])

  // Barrel and liquid.
  rect(BARREL_X, BARREL_Y, BARREL_W, BARREL_H, 6, t['syringe-barrel'])
  ctx.strokeStyle = t['syringe-ink']
  ctx.lineWidth = 2
  ctx.stroke()
  const fluid = ctx.createLinearGradient(0, BARREL_Y, 0, BARREL_Y + BARREL_H)
  fluid.addColorStop(0, t['syringe-fill-deep'])
  fluid.addColorStop(0.28, t['syringe-fill'])
  fluid.addColorStop(0.55, t['syringe-fill'])
  fluid.addColorStop(1, t['syringe-fill-deep'])
  ctx.globalAlpha = 0.92
  rect(BARREL_X + 1, BARREL_Y + 1, fillX - BARREL_X - 1, BARREL_H - 2, 5, fluid)
  ctx.globalAlpha = 1

  // Plunger rod, stopper with its groove, thumb rest and flange.
  rect(
    fillX + STOPPER_W,
    MID_Y - 5,
    BARREL_X + BARREL_W + 52 - fillX - STOPPER_W,
    10,
    0,
    t['syringe-plunger'],
  )
  rect(fillX, BARREL_Y + 2, STOPPER_W, BARREL_H - 4, 2, t['syringe-ink'])
  ctx.globalAlpha = 0.6
  rect(fillX + 4, BARREL_Y + 5, 4, BARREL_H - 10, 1, t['syringe-plunger'])
  ctx.globalAlpha = 1
  rect(BARREL_X + 8, BARREL_Y + 7, BARREL_W - 16, 5, 2.5, t['syringe-glint'])
  rect(BARREL_X + BARREL_W + 52, BARREL_Y - 6, 10, BARREL_H + 12, 3, t['syringe-plunger'])
  rect(BARREL_X + BARREL_W - 2, BARREL_Y - 12, 8, BARREL_H + 24, 3, t['syringe-plunger'])

  // Graduations along the top edge, numbers below.
  ctx.strokeStyle = t['syringe-ink']
  ctx.lineWidth = 1.5
  ctx.font = `500 15px ${mono}`
  ctx.fillStyle = t['text-2']
  ctx.textAlign = 'center'
  ctx.beginPath()
  for (const tick of syringeTicks(syringe)) {
    const x = BARREL_X + BARREL_W * tick.at
    ctx.moveTo(x, BARREL_Y)
    ctx.lineTo(x, BARREL_Y + TICK_LENGTH[tick.kind])
    if (tick.label !== null) ctx.fillText(tick.label, x, BARREL_Y + BARREL_H + 20)
  }
  ctx.stroke()

  // The draw line and its reading, kept inside the drawing near either end.
  ctx.strokeStyle = t['text-1']
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(fillX, BARREL_Y - 6)
  ctx.lineTo(fillX, BARREL_Y + BARREL_H + 4)
  ctx.stroke()
  ctx.setLineDash([])
  const flagX = Math.min(Math.max(fillX, BARREL_X + 40), BARREL_X + BARREL_W - 40)
  ctx.font = `700 18px ${font}`
  ctx.fillStyle = t['text-1']
  ctx.fillText(
    reading.fits
      ? `${roundTo(reading.scaleValue, 2)} ${scaleName}`
      : `exceeds ${capacity} ${scaleName}`,
    flagX,
    BARREL_Y - 12,
  )
  ctx.textAlign = 'left'
  ctx.restore()
}
