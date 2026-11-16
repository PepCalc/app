import { describe, expect, it } from 'vitest'
import { niceRange, niceTicks, periodStart, reportWindow } from '@/domain/report'

const DAY = 86_400_000
const H = 3_600_000

describe('periodStart', () => {
  it('reaches back 30 or 90 days, or everything', () => {
    expect(periodStart('30d', 100 * DAY)).toBe(70 * DAY)
    expect(periodStart('90d', 100 * DAY)).toBe(10 * DAY)
    expect(periodStart('all', 100 * DAY)).toBe(-Infinity)
  })
})

describe('reportWindow', () => {
  const params = { halfLifeHours: 168, tmaxHours: 56 }
  it('starts just before the first dose in the period, even with older doses', () => {
    const doses = [
      { at: 0, amount: 1 },
      { at: 40 * DAY, amount: 1 },
    ]
    const w = reportWindow(doses, params, 50 * DAY, 30 * DAY)
    expect(w.start).toBe(40 * DAY - 14 * H)
    expect(w.end).toBeGreaterThan(50 * DAY + 5 * 168 * H - 1)
  })

  it('falls back to now when the period has no dose', () => {
    expect(reportWindow([], params, 50 * DAY, 30 * DAY).start).toBe(50 * DAY - 14 * H)
  })
})

describe('niceTicks', () => {
  it('uses round steps that cover the maximum', () => {
    expect(niceTicks(0.845)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(niceTicks(1.87)).toEqual([0, 0.5, 1, 1.5, 2])
    expect(niceTicks(10)).toEqual([0, 2.5, 5, 7.5, 10])
    expect(niceTicks(0.0031)).toEqual([0, 0.001, 0.002, 0.003, 0.004])
  })

  it('has a sensible axis when there is nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('reportWindow for short-acting products', () => {
  const tesamorelin = { halfLifeHours: 0.5, tmaxHours: 0.15 }
  const daily = Array.from({ length: 90 }, (_, i) => ({ at: i * DAY, amount: 2 }))

  it('shows the three days up to the latest dose, as the in-app chart does', () => {
    const w = reportWindow(daily, tesamorelin, 95 * DAY, 0)
    expect(w.trimmed).toBe(true)
    expect(w.start).toBe(89 * DAY - 72 * H)
  })

  it('keeps the whole period when it is already shorter than three days', () => {
    const w = reportWindow(daily.slice(-2), tesamorelin, 90 * DAY, 0)
    expect(w.trimmed).toBe(false)
    expect(w.start).toBeLessThan(88 * DAY)
  })

  it('never trims a long-acting product', () => {
    const w = reportWindow(daily, { halfLifeHours: 168, tmaxHours: 56 }, 95 * DAY, 0)
    expect(w.trimmed).toBe(false)
  })
})

describe('niceRange', () => {
  it('spans the values in round steps that need not start at zero', () => {
    expect(niceRange(88.4, 101.2)).toEqual([85, 90, 95, 100, 105])
    expect(niceRange(6.1, 7.4)).toEqual([6, 6.5, 7, 7.5])
    const flat = niceRange(80, 80)
    expect(flat[0]).toBeLessThanOrEqual(79)
    expect(flat[flat.length - 1]).toBeGreaterThanOrEqual(81)
  })
})
