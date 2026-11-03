import { describe, expect, it } from 'vitest'
import {
  amountTicks,
  levelStrip,
  stripReadings,
  stripScale,
  stripWindow,
  type StripInput,
} from '@/domain/levelStrip'

const H = 3_600_000
const DAY = 24 * H
const now = 200 * DAY

const sema: StripInput = {
  key: 'semaglutide',
  label: 'Semaglutide',
  params: { halfLifeHours: 168, tmaxHours: 56 },
  doses: [0, 7, 14, 21].map((d) => ({ at: now - 40 * DAY + d * DAY, amount: 0.25 })),
  unitLabel: 'mg',
}
const tesa: StripInput = {
  key: 'tesamorelin',
  label: 'Tesamorelin',
  params: { halfLifeHours: 0.5, tmaxHours: 0.15 },
  doses: [30, 31, 32].map((d) => ({ at: now - 40 * DAY + d * DAY, amount: 1000 })),
  unitLabel: 'mcg',
}

describe('stripScale', () => {
  it('reads in the peptide’s unit beside a measure in real units', () => {
    expect(stripScale(false, 1)).toBe('amount')
  })

  it('reads as percent of peak beside a percent change, or for two peptides', () => {
    expect(stripScale(true, 1)).toBe('percent')
    expect(stripScale(false, 2)).toBe('percent')
  })
})

describe('stripWindow', () => {
  it('runs from the first entry to now, or a week back for a lone entry', () => {
    expect(stripWindow([now - 30 * DAY], now)).toEqual({ start: now - 30 * DAY, end: now })
    expect(stripWindow([now], now)).toEqual({ start: now - 7 * DAY, end: now })
  })
})

describe('levelStrip', () => {
  const window = { start: now - 40 * DAY, end: now }

  it('scales each peptide to its own peak, whatever its unit', () => {
    const [s, t] = levelStrip([sema, tesa], window)
    expect(Math.max(...s!.points.map((p) => p[1]))).toBeCloseTo(100, 6)
    expect(Math.max(...t!.points.map((p) => p[1]))).toBeCloseTo(100, 6)
    expect(t!.unitLabel).toBe('mcg')
  })

  it('reads every line exactly at one moment', () => {
    const series = levelStrip([sema], window)
    const [r] = stripReadings([sema], series, now - 10 * DAY)
    expect(r!.percent).toBeCloseTo((r!.amount / series[0]!.peak) * 100, 9)
  })
})

describe('amountTicks', () => {
  it('runs from zero past the peak', () => {
    const series = levelStrip([sema], { start: now - 40 * DAY, end: now })
    const ticks = amountTicks(series)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(series[0]!.peak)
  })
})
