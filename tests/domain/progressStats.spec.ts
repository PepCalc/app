import { describe, expect, it } from 'vitest'
import { changeStats } from '@/domain/progressStats'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const T0 = Date.UTC(2026, 0, 1)

describe('changeStats', () => {
  it('1. computes change, percent, and weekly average over 10 weeks', () => {
    expect(changeStats({ at: T0, kg: 100 }, { at: T0 + 10 * WEEK_MS, kg: 90 })).toEqual({
      changeKg: -10,
      changePercent: -10,
      weeklyKg: -1,
      startAt: T0,
      latestAt: T0 + 10 * WEEK_MS,
    })
  })

  it('2. computes positive values for weight gain over 4 weeks', () => {
    expect(changeStats({ at: T0, kg: 80 }, { at: T0 + 4 * WEEK_MS, kg: 82 })).toEqual({
      changeKg: 2,
      changePercent: 2.5,
      weeklyKg: 0.5,
      startAt: T0,
      latestAt: T0 + 4 * WEEK_MS,
    })
  })

  it('3. omits weekly average when the span is 13 days', () => {
    expect(changeStats({ at: T0, kg: 100 }, { at: T0 + 13 * DAY_MS, kg: 98 })).toEqual({
      changeKg: -2,
      changePercent: -2,
      weeklyKg: null,
      startAt: T0,
      latestAt: T0 + 13 * DAY_MS,
    })
  })

  it('4. computes weekly average when the span is exactly 14 days', () => {
    expect(changeStats({ at: T0, kg: 100 }, { at: T0 + 14 * DAY_MS, kg: 98 })).toEqual({
      changeKg: -2,
      changePercent: -2,
      weeklyKg: -1,
      startAt: T0,
      latestAt: T0 + 14 * DAY_MS,
    })
  })

  it('5. returns null when start and latest are at the same instant', () => {
    expect(changeStats({ at: T0, kg: 100 }, { at: T0, kg: 99 })).toBeNull()
  })

  it('6. returns zeros, not null, when weight did not change over 8 weeks', () => {
    expect(changeStats({ at: T0, kg: 90 }, { at: T0 + 8 * WEEK_MS, kg: 90 })).toEqual({
      changeKg: 0,
      changePercent: 0,
      weeklyKg: 0,
      startAt: T0,
      latestAt: T0 + 8 * WEEK_MS,
    })
  })

  it('7. keeps unrounded outputs so formatting handles rounding', () => {
    const stats = changeStats({ at: T0, kg: 82.37 }, { at: T0 + 3 * WEEK_MS, kg: 79.91 })!
    expect(stats.changeKg).toBeCloseTo(-2.46, 9)
    expect(stats.changePercent).toBeCloseTo((-2.46 / 82.37) * 100, 9)
    expect(stats.weeklyKg).toBeCloseTo(-2.46 / 3, 9)
  })
})
