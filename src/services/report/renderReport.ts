import { buildPdf, type PdfPage, type Point } from '@/services/pdf/document'
import { measure } from '@/services/pdf/text'
import { Layout, MARGIN, TOP } from './layout'
import { chartGutter, drawChart, drawTimeline, timelineHeight } from './pdfChart'
import { ink, MARK_COLOURS, rgb, tint } from './printPalette'
import type { ReportChart, ReportData, ReportPeptide } from './reportData'

const LEVELS_CAVEAT =
  'Estimated amount left in the body from logged doses, not blood levels. Based on a simple ' +
  'model from the half-life and time to peak.'

/** The PepCalc mark drawn from the same geometry as public/favicon.svg (512 unit grid). */
function drawMark(page: PdfPage, x: number, y: number, size: number) {
  const k = size / 512
  const p = (gx: number, gy: number): Point => [x + (gx - 6) * k, y + (gy - 10) * k]
  const glyph = rgb(MARK_COLOURS.glyph)
  const tile = rgb(MARK_COLOURS.tile)
  page.rect(x, y, size, size, { fill: tile }, 112 * k)
  const [sx, sy] = p(144, 100)
  page.rect(sx, sy, 56 * k, 268 * k, { fill: glyph }, 18 * k)
  for (const ty of [264, 300, 336])
    page.line(p(144, ty), p(170, ty), { color: tile, width: 10 * k })
  page.polygon([p(152, 368), p(192, 368), p(180, 390), p(164, 390)], { fill: glyph })
  page.line(p(172, 390), p(172, 430), { color: glyph, width: 8 * k })
  const [cx, cy] = p(276, 204)
  page.circle(cx, cy, 80 * k, { stroke: { color: glyph, width: 48 * k } })
  // The liquid: the part of a 44-unit circle below a meniscus 12 units above its centre.
  const start = Math.asin(-12 / 44)
  const arc: Point[] = Array.from({ length: 25 }, (_, i) => {
    const a = start + ((Math.PI - 2 * start) * i) / 24
    return [cx + 44 * k * Math.cos(a), cy + 44 * k * Math.sin(a)]
  })
  page.polygon(arc, { fill: rgb(MARK_COLOURS.fluid) })
}

function drawHeader(layout: Layout, data: ReportData) {
  const { page } = layout
  drawMark(page, MARGIN, TOP - 6, 26)
  const word = page.text(MARGIN + 34, TOP + 13, 'Pep', {
    font: 'bold',
    size: 15,
    color: ink['text-1'],
  })
  page.text(MARGIN + 34 + word, TOP + 13, 'Calc', { font: 'bold', size: 15, color: ink.brand })
  page.text(layout.size.width - MARGIN, TOP + 12, `Generated ${data.generated}`, {
    size: 8.5,
    color: ink['text-3'],
    align: 'right',
  })

  layout.y = TOP + 52
  page.text(MARGIN, layout.y, 'REPORT', { font: 'bold', size: 8, color: ink.accent })
  layout.y += 24
  page.text(MARGIN, layout.y, data.title, { font: 'bold', size: 22, color: ink['text-1'] })
  layout.y += 18
  page.text(MARGIN, layout.y, data.periodLabel, { size: 10.5, color: ink['text-2'] })
  layout.y += 10
  layout.stats(data.summary)
  layout.gap(4)
  page.rect(MARGIN, layout.y, layout.width, 30, { fill: ink['surface-2'] }, 6)
  page.text(MARGIN + 12, layout.y + 18.5, 'Made with PepCalc on this device.', {
    size: 8.5,
    color: ink['text-2'],
  })
  layout.y += 30
  layout.rule()
}

/** A rounded label like the app's badges; returns its width. */
function pill(
  page: PdfPage,
  x: number,
  baseline: number,
  text: string,
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
) {
  const size = 8.5
  const width = measure(text, 'bold', size) + 14
  page.rect(x, baseline - 10.5, width, 15, { fill: bg }, 7.5)
  page.text(x + 7, baseline, text, { font: 'bold', size, color: fg })
  return width
}

/** A chart at the cursor, on the next page when it will not fit; the cursor moves below it. */
function chart(layout: Layout, data: ReportData, spec: ReportChart, height = 180) {
  layout.ensure(height + 2)
  drawChart(layout.page, { x: MARGIN, y: layout.y, width: layout.width, height }, spec, {
    formatTick: data.formatTick,
    timeAxis: true,
  })
  layout.y += height + 2
}

function drawCombined(layout: Layout, data: ReportData) {
  const { panels, timeline, window, notes } = data.combined!
  layout.heading('Combined chart')
  const labelWidth = Math.max(0, ...timeline.map((r) => measure(r.label, 'regular', 7.5)))
  // One gutter for every panel, so their plots line up on the shared time axis.
  const gutter = Math.max(40, Math.min(labelWidth, 110) + 8, ...panels.map(chartGutter))
  const options = { formatTick: data.formatTick, gutter }
  const PANEL = 96
  const AXIS = 14
  const timelineAt = timeline.length ? timelineHeight(timeline.length, true) : 0
  panels.forEach((panel, i) => {
    const last = i === panels.length - 1 && !timeline.length
    const next = i < panels.length - 1 ? PANEL : timelineAt
    // Time labels go under the last panel, and under any panel the next one leaves behind.
    layout.ensure(PANEL + AXIS + 2)
    const timeAxis = last || !layout.fits(PANEL + 2 + next + 2)
    const height = PANEL + (timeAxis ? AXIS : 0)
    drawChart(layout.page, { x: MARGIN, y: layout.y, width: layout.width, height }, panel, {
      ...options,
      timeAxis,
    })
    layout.y += height + 2
  })
  if (timeline.length) {
    layout.ensure(timelineAt + 2)
    drawTimeline(
      layout.page,
      { x: MARGIN, y: layout.y, width: layout.width, height: timelineAt },
      timeline,
      window,
      { ...options, timeAxis: true, title: 'Events' },
    )
    layout.y += timelineAt + 2
  }
  layout.gap(4)
  for (const note of notes) layout.paragraph(note, 'regular', 8, ink['text-3'])
  layout.rule()
}

function drawPeptide(layout: Layout, data: ReportData, peptide: ReportPeptide) {
  // Keep a peptide's name, figures and chart together on one page.
  layout.ensure(peptide.curve ? 300 : 110)
  layout.heading(peptide.name)
  const { page } = layout

  if (peptide.pk) {
    layout.y += 14
    let x = MARGIN
    x += pill(page, x, layout.y, `t½ ${peptide.pk.halfLife}`, ink.brand, tint(ink.brand, 0.14)) + 6
    x += pill(page, x, layout.y, `peak ${peptide.pk.peak}`, ink.brand, tint(ink.brand, 0.14)) + 6
    const [fg, bg] = peptide.pk.userSupplied
      ? [ink['notice-fg'], ink['notice-bg']]
      : [ink['good-fg'], ink['good-bg']]
    pill(page, x, layout.y, peptide.pk.sourceLabel, fg, bg)
    layout.y += 8
  }

  layout.stats(peptide.stats)

  if (peptide.curve) {
    layout.gap(2)
    chart(layout, data, peptide.curve.chart)
    if (peptide.curve.note) layout.paragraph(peptide.curve.note, 'regular', 8, ink['text-2'])
    layout.paragraph(LEVELS_CAVEAT, 'regular', 8, ink['text-3'])
  } else if (peptide.noCurveReason) {
    layout.gap(4)
    layout.paragraph(peptide.noCurveReason, 'regular', 9, ink['text-2'])
  }

  if (peptide.pk && !peptide.pk.userSupplied) {
    layout.gap(4)
    if (peptide.pk.notes) layout.paragraph(peptide.pk.notes, 'regular', 8, ink['text-2'])
    for (const citation of peptide.pk.citations) {
      layout.paragraph(`Source: ${citation}`, 'regular', 8, ink['text-3'])
    }
  }
  layout.rule()
}

function drawWeight(layout: Layout, data: ReportData) {
  const weight = data.weight!
  layout.heading('Weight')
  layout.stats(weight.stats)
  if (weight.weight) chart(layout, data, weight.weight, 160)
  if (weight.bmi) {
    layout.gap(6)
    chart(layout, data, weight.bmi, 140)
  }
  layout.gap(2)
  for (const note of weight.notes) layout.paragraph(note, 'regular', 8, ink['text-3'])
  layout.rule()
}

function drawSugar(layout: Layout, data: ReportData) {
  const sugar = data.sugar!
  if (sugar.a1cChart || sugar.glucoseChart) {
    layout.heading('Blood sugar')
    if (sugar.a1cChart) chart(layout, data, sugar.a1cChart, 140)
    if (sugar.glucoseChart) {
      layout.gap(6)
      chart(layout, data, sugar.glucoseChart, 140)
    }
    layout.rule()
  }
  layout.table('HbA1c', sugar.a1c)
  layout.rule()
  layout.table('Blood glucose', sugar.glucose)
  layout.rule()
}

/**
 * Lay out the report and serialise it to PDF bytes, printing only the sections the reader
 * chose. Pure: the same data gives the same file, so it is tested without a browser. Callers
 * format every date and number for the reader's locale before passing them in.
 */
export function renderReport(data: ReportData): Uint8Array<ArrayBuffer> {
  const layout = new Layout(data.pageSize)
  drawHeader(layout, data)
  if (data.combined) drawCombined(layout, data)
  if (data.peptides) for (const peptide of data.peptides) drawPeptide(layout, data, peptide)
  if (data.weight) drawWeight(layout, data)
  if (data.sugar) drawSugar(layout, data)
  if (data.symptoms) {
    layout.table('Side effects', data.symptoms.table, data.symptoms.notes)
    layout.rule()
  }
  if (data.draws) {
    layout.table('Draw log', data.draws)
    layout.rule()
  }
  layout.ensure(90)
  layout.heading('About these numbers', 12)
  for (const paragraph of data.about) {
    layout.paragraph(paragraph, 'regular', 9, ink['text-2'])
    layout.gap(4)
  }
  layout.footers('PepCalc · A calculator, not medical advice.')
  return buildPdf(layout.pages, `PepCalc report: ${data.title}`)
}
