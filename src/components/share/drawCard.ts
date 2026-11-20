import markUrl from '@/assets/brand/pepcalc-mark.svg'
import type { SolutionColor } from '@/domain/catalog'
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
  /** Visual tint of the drawn liquid ('clear' or 'blue'). */
  solutionColor?: SolutionColor
  /** A blend's share of the draw: "BPC-157 250 mcg". Empty for a single peptide. */
  components: string[]
  /** Short warnings about this draw: more than the vial holds, or the syringe cannot measure it. */
  warnings: string[]
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
  const syringeH = 260
  glassPanel(ctx, t, PAD - 24, y, inner + 48, syringeH)
  const syringePalette = readSyringePalette(style, t, content.solutionColor ?? 'clear')
  // The drawing's ink spans viewBox rows 6 to 128; centre that band in the panel.
  const scale = (inner + 12) / VIEW_W
  const syringeTop = y + (syringeH - 122 * scale) / 2 - 6 * scale
  drawSyringe(
    ctx,
    t,
    syringePalette,
    font,
    mono,
    content.syringe,
    content.volumeMl,
    PAD - 6,
    syringeTop,
    inner + 12,
  )

  // Below the syringe, most important first, in the room above the footer: warnings, a blend's
  // contents, and the reminder to check the label. Each is ellipsised rather than cut silently.
  y += syringeH + 46
  const blocks: { text: string; weight: number; colour: string }[] = [
    ...content.warnings.map((text) => ({ text, weight: 600, colour: t['notice-fg'] })),
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
const BARREL_X = 88
const BARREL_W = 452
const BARREL_Y = 44
const BARREL_H = 52
const MID_Y = BARREL_Y + BARREL_H / 2
const STOPPER_W = 16
const HANDLE_X = BARREL_X + BARREL_W + 44
const TICK_LENGTH = { major: 21, half: 14, minor: 8 } as const

interface SyringePalette {
  barrelShade: string
  fluidLight: string
  fluidMid: string
  fluidDeep: string
  meniscus: string
  steelLight: string
  steelDark: string
  hub: string
  hubDeep: string
  stopper: string
  stopperHi: string
  rodHi: string
  rodShade: string
  surface2: string
  dividerStrong: string
  alertBg: string
  alertFg: string
}

function readSyringePalette(
  style: CSSStyleDeclaration,
  t: CardTokens,
  color: SolutionColor,
): SyringePalette {
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(`--pc-${name}`).trim() || fallback
  const prefix = color === 'blue' ? 'syringe-blue' : 'syringe-clear'
  return {
    barrelShade: token('syringe-barrel-shade', t['syringe-barrel']),
    fluidLight: token(`${prefix}-light`, t['syringe-fill']),
    fluidMid: token(`${prefix}-mid`, t['syringe-fill']),
    fluidDeep: token(`${prefix}-deep`, t['syringe-fill-deep']),
    meniscus: token(`${prefix}-meniscus`, t['syringe-fill-deep']),
    steelLight: token('syringe-steel-light', t['syringe-plunger']),
    steelDark: token('syringe-steel-dark', t['syringe-ink']),
    hub: token('syringe-hub', t.accent),
    hubDeep: token('syringe-hub-deep', t['syringe-fill-deep']),
    stopper: token('syringe-stopper', t['syringe-ink']),
    stopperHi: token('syringe-stopper-hi', t['syringe-plunger']),
    rodHi: token('syringe-rod-hi', t['syringe-barrel']),
    rodShade: token('syringe-rod-shade', t['syringe-plunger']),
    surface2: token('surface-2', t.surface),
    dividerStrong: token('divider-strong', t['glass-edge']),
    alertBg: token('alert-bg', t.surface),
    alertFg: token('alert-fg', t['notice-fg']),
  }
}

/**
 * The syringe as the calculator draws it, at rest at the reading: beveled needle, contoured hub,
 * cylindrical barrel, clear or blue liquid with meniscus, dual-ribbed stopper, cruciform rod with
 * fixed handle, graduations, and the floating reading pill.
 */
function drawSyringe(
  ctx: CanvasRenderingContext2D,
  t: CardTokens,
  p: SyringePalette,
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
  const liquidW = Math.max(0, fillX - BARREL_X - 1)
  const rodX = fillX + STOPPER_W - 1
  const rodW = Math.max(0, HANDLE_X - rodX + 2)
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

  const vGrad = (y0: number, y1: number, stops: [number, string][]) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    for (const [offset, colour] of stops) g.addColorStop(offset, colour)
    return g
  }

  const barrelGrad = vGrad(BARREL_Y, BARREL_Y + BARREL_H, [
    [0, p.barrelShade],
    [0.16, t['syringe-barrel']],
    [0.82, t['syringe-barrel']],
    [1, p.barrelShade],
  ])
  const rodGrad = vGrad(MID_Y - 8, MID_Y + 8, [
    [0, p.rodShade],
    [0.3, p.rodHi],
    [0.65, t['syringe-plunger']],
    [1, p.rodShade],
  ])
  const hubGrad = vGrad(MID_Y - 10, MID_Y + 10, [
    [0, p.hubDeep],
    [0.32, p.hub],
    [0.72, p.hub],
    [1, p.hubDeep],
  ])
  const stopperGrad = vGrad(BARREL_Y + 2, BARREL_Y + BARREL_H - 2, [
    [0, p.stopper],
    [0.28, p.stopperHi],
    [0.62, p.stopper],
    [1, p.stopper],
  ])

  // Beveled steel needle.
  const steelGrad = vGrad(MID_Y - 2, MID_Y + 2, [
    [0, p.steelDark],
    [0.38, p.steelLight],
    [1, p.steelDark],
  ])
  ctx.fillStyle = steelGrad
  ctx.beginPath()
  ctx.moveTo(6, MID_Y)
  ctx.lineTo(16, MID_Y - 1.8)
  ctx.lineTo(62, MID_Y - 1.8)
  ctx.lineTo(62, MID_Y + 1.8)
  ctx.lineTo(12, MID_Y + 1.8)
  ctx.closePath()
  ctx.fill()

  // Contoured needle hub and barrel shoulder.
  rect(60, MID_Y - 6.5, 11, 13, 2, hubGrad)
  rect(69, MID_Y - 10, 14, 20, 2.5, hubGrad)
  ctx.fillStyle = barrelGrad
  ctx.strokeStyle = t['syringe-ink']
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(82, MID_Y - 12)
  ctx.lineTo(BARREL_X + 2, BARREL_Y + 6)
  ctx.lineTo(BARREL_X + 2, BARREL_Y + BARREL_H - 6)
  ctx.lineTo(82, MID_Y + 12)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cruciform plunger rod to the fixed thumb handle.
  rect(rodX, MID_Y - 7.5, rodW, 15, 0, rodGrad)

  // Barrel cylinder background.
  rect(BARREL_X, BARREL_Y, BARREL_W, BARREL_H, 6, barrelGrad)

  // Clipped barrel interior: internal rod, liquid, meniscus, stopper, glass highlights.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(BARREL_X + 1, BARREL_Y + 1, BARREL_W - 2, BARREL_H - 2, 5)
  ctx.clip()

  rect(rodX, MID_Y - 7, rodW, 14, 0, rodGrad)

  if (liquidW > 0.5) {
    const fluid = vGrad(BARREL_Y, BARREL_Y + BARREL_H, [
      [0, p.fluidDeep],
      [0.24, p.fluidLight],
      [0.58, p.fluidMid],
      [1, p.fluidDeep],
    ])
    ctx.globalAlpha = 0.94
    rect(BARREL_X + 1, BARREL_Y + 1, liquidW, BARREL_H - 2, 0, fluid)
    ctx.globalAlpha = 0.32
    rect(BARREL_X + 1, BARREL_Y + BARREL_H - 5, liquidW, 3.5, 0, p.meniscus)
    ctx.globalAlpha = 0.2
    rect(BARREL_X + 1, BARREL_Y + 1.5, liquidW, 2.5, 0, p.meniscus)
    ctx.globalAlpha = 1
    ctx.strokeStyle = p.meniscus
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    const curve = Math.min(5, liquidW * 0.35)
    ctx.beginPath()
    ctx.moveTo(fillX - 0.5, BARREL_Y + 2)
    ctx.quadraticCurveTo(fillX - 0.5 - curve, MID_Y, fillX - 0.5, BARREL_Y + BARREL_H - 2)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // Dual-ribbed rubber stopper.
  rect(fillX, BARREL_Y + 2, 6, BARREL_H - 4, 1.5, stopperGrad)
  rect(fillX + 5.5, BARREL_Y + 5, 5, BARREL_H - 10, 0, stopperGrad)
  rect(fillX + 10, BARREL_Y + 2, 6, BARREL_H - 4, 1.5, stopperGrad)

  // Glass barrel specular reflections.
  rect(BARREL_X + 6, BARREL_Y + 6, BARREL_W - 12, 6, 3, t['syringe-glint'])
  ctx.globalAlpha = 0.45
  rect(BARREL_X + 10, BARREL_Y + 14, BARREL_W - 20, 2, 1, t['syringe-glint'])
  ctx.globalAlpha = 0.3
  rect(BARREL_X + 12, BARREL_Y + BARREL_H - 9, BARREL_W - 24, 2.5, 1.25, t['syringe-glint'])
  ctx.globalAlpha = 1
  ctx.restore()

  // Crisp barrel rim, flared finger flange, and fixed thumb rest.
  ctx.strokeStyle = t['syringe-ink']
  ctx.lineWidth = 1.75
  ctx.beginPath()
  ctx.roundRect(BARREL_X, BARREL_Y, BARREL_W, BARREL_H, 6)
  ctx.stroke()
  const handleGrad = vGrad(BARREL_Y - 15, BARREL_Y + BARREL_H + 15, [
    [0, p.rodShade],
    [0.3, p.rodHi],
    [0.65, t['syringe-plunger']],
    [1, p.rodShade],
  ])
  rect(BARREL_X + BARREL_W + 1, BARREL_Y - 11, 10, BARREL_H + 22, 4.5, handleGrad)
  rect(HANDLE_X, BARREL_Y - 9, 14, BARREL_H + 18, 5, handleGrad)

  // Graduations along the top edge, numbers below.
  ctx.strokeStyle = t['syringe-ink']
  ctx.font = `500 14.5px ${mono}`
  ctx.fillStyle = t['text-2']
  ctx.textAlign = 'center'
  for (const tick of syringeTicks(syringe)) {
    const x = BARREL_X + BARREL_W * tick.at
    ctx.lineWidth = tick.kind === 'major' ? 1.8 : tick.kind === 'half' ? 1.45 : 1.25
    ctx.beginPath()
    ctx.moveTo(x, BARREL_Y)
    ctx.lineTo(x, BARREL_Y + TICK_LENGTH[tick.kind])
    ctx.stroke()
    if (tick.label !== null) ctx.fillText(tick.label, x, BARREL_Y + BARREL_H + 22)
  }

  // Draw alignment line and floating reading pill.
  const label = reading.fits
    ? `${roundTo(reading.scaleValue, 2)} ${scaleName}`
    : `exceeds ${capacity} ${scaleName}`
  const pillW = Math.max(88, label.length * 10 + 24)
  const flagX = Math.min(
    Math.max(fillX, BARREL_X + pillW / 2 - 12),
    BARREL_X + BARREL_W - pillW / 2 + 12,
  )
  ctx.strokeStyle = reading.fits ? p.meniscus : p.alertFg
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(fillX, BARREL_Y - 8)
  ctx.lineTo(fillX, BARREL_Y + BARREL_H + 5)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = reading.fits ? t['text-1'] : p.alertFg
  ctx.beginPath()
  ctx.moveTo(fillX - 5, BARREL_Y - 12)
  ctx.lineTo(fillX + 5, BARREL_Y - 12)
  ctx.lineTo(fillX, BARREL_Y - 5)
  ctx.closePath()
  ctx.fill()

  rect(flagX - pillW / 2, 4, pillW, 27, 13.5, reading.fits ? p.surface2 : p.alertBg)
  ctx.strokeStyle = reading.fits ? p.dividerStrong : p.alertFg
  ctx.lineWidth = 1.25
  ctx.stroke()

  ctx.font = `700 15.5px ${font}`
  ctx.fillStyle = reading.fits ? t['text-1'] : p.alertFg
  ctx.fillText(label, flagX, 22.5)
  ctx.textAlign = 'left'
  ctx.restore()
}
