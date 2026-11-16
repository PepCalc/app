import { describe, expect, it } from 'vitest'
import type { ChartColors } from '@/composables/useChartColors'
import { bodyChartOption, type BodyChartInput } from '@/components/charts/bodyChart'
import { doseBands, type BandDose } from '@/domain/doseBands'

const DAY = 86_400_000
const t = (day: number) => day * DAY

const COLORS = {
  logged: '#1c6468',
  preview: '#c0643f',
  grid: '#e8ddcc',
  axis: '#7a6c54',
  now: '#877960',
  doses: ['#5f5544', '#246bc2', '#b55633', '#125659', '#8f6114', '#8c3d86', '#1e6940', '#473fa3'],
  onDose: '#fffdf9',
  text: '#1d1a14',
  surface: '#fffdf9',
  font: 'Hanken Grotesk',
} as ChartColors

const points = [
  { at: t(0), value: 100 },
  { at: t(14), value: 98 },
  { at: t(28), value: 96 },
  { at: t(42), value: 94 },
]

const baseInput = (extra: Partial<BodyChartInput> = {}): BodyChartInput => ({
  points,
  unitLabel: 'kg',
  measure: 'Weight',
  decimals: 1,
  guides: [],
  ...extra,
})

const dose = (day: number, amount: number, key = 'sema', label = 'Wegovy'): BandDose => ({
  key,
  label,
  at: t(day),
  amount,
  unitLabel: 'mg',
})

describe('bodyChartOption', () => {
  it('1. omits visualMap and the Doses series when doses are absent', () => {
    const option = bodyChartOption(baseInput(), COLORS)
    expect(option.visualMap).toBeUndefined()
    const names = (option.series as { name?: string }[]).map((s) => s.name)
    expect(names).not.toContain('Doses')
  })

  it('2. builds piecewise visualMap pieces matching the three band edges and slot colours', () => {
    const doses = doseBands([dose(0, 2.5), dose(14, 5), dose(28, 7.5)], points)
    const option = bodyChartOption(baseInput({ doses }), COLORS)
    const vm = option.visualMap as {
      pieces: { gte: number; lt?: number; lte?: number; color: string }[]
    }
    expect(vm.pieces).toEqual([
      { gte: t(0), lt: t(14), color: COLORS.doses[0] },
      { gte: t(14), lt: t(28), color: COLORS.doses[1] },
      { gte: t(28), lte: t(42), color: COLORS.doses[2] },
    ])
  })

  it('3. creates one Doses point per shot and shows pills strictly for labelled indices', () => {
    const doses = doseBands([dose(0, 2.5), dose(7, 2.5), dose(14, 5), dose(21, 5)], points)
    const labelled = new Set([0, 2])
    const option = bodyChartOption(baseInput({ doses }), COLORS, { labelled })
    const series = (option.series as { name?: string; data?: unknown[] }[]).find(
      (s) => s.name === 'Doses',
    )!
    expect(series.data).toHaveLength(doses.shots.length)
    const shows = (series.data as { label: { show: boolean } }[]).map((d) => d.label.show)
    expect(shows).toEqual([true, false, true, false])
  })

  it('4. prefixes the medicine name on the first shot of each medicine when named is true', () => {
    const doses = doseBands(
      [
        dose(0, 0.5, 'sema', 'Wegovy'),
        dose(7, 1, 'sema', 'Wegovy'),
        dose(14, 2.5, 'tirz', 'Zepbound'),
        dose(21, 5, 'tirz', 'Zepbound'),
      ],
      points,
    )
    const option = bodyChartOption(baseInput({ doses }), COLORS)
    const series = (option.series as { name?: string; data?: { text: string }[] }[]).find(
      (s) => s.name === 'Doses',
    )!
    expect(series.data!.map((d) => d.text)).toEqual([
      'Wegovy 0.5 mg',
      '1 mg',
      'Zepbound 2.5 mg',
      '5 mg',
    ])
  })

  it('5. passes window start and end through to dataZoom', () => {
    const option = bodyChartOption(baseInput({ window: { start: t(7), end: t(35) } }), COLORS)
    const zoom = (option.dataZoom as { startValue?: number; endValue?: number }[])[0]!
    expect(zoom.startValue).toBe(t(7))
    expect(zoom.endValue).toBe(t(35))
  })

  it('6. hides value axis labels when hideValues is set', () => {
    const option = bodyChartOption(baseInput(), COLORS, { hideValues: true })
    const yAxis = option.yAxis as { axisLabel: { show: boolean } }
    expect(yAxis.axisLabel.show).toBe(false)
  })

  it('7. leaves room at grid.top for the taller of photo pins and dose pills', () => {
    const doses = doseBands([dose(0, 2.5)], points)
    const plainTop = (bodyChartOption(baseInput(), COLORS).grid as { top: number }).top
    const dosesTop = (bodyChartOption(baseInput({ doses }), COLORS).grid as { top: number }).top
    const bothTop = (
      bodyChartOption(
        baseInput({ doses, photos: [{ id: '1', at: t(14), value: 98, symbol: 'x' }] }),
        COLORS,
      ).grid as { top: number }
    ).top
    const photosOnlyTop = (
      bodyChartOption(
        baseInput({ photos: [{ id: '1', at: t(14), value: 98, symbol: 'x' }] }),
        COLORS,
      ).grid as { top: number }
    ).top
    expect(dosesTop).toBeGreaterThan(plainTop)
    expect(bothTop).toBe(Math.max(dosesTop, photosOnlyTop))
  })
})
