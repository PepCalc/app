import { describe, expect, it } from 'vitest'
import {
  amountAt,
  chartWindow,
  rateConstants,
  simulate,
  singleDoseAmount,
  steadyAmount,
  steadyLevels,
  summarizeLevels,
  tmaxFor,
} from '@/domain/pk'

const H = 3_600_000

describe('rate constants', () => {
  it('recovers the published half-life and time to peak (semaglutide)', () => {
    const k = rateConstants({ halfLifeHours: 168, tmaxHours: 56 })
    expect(Math.LN2 / k.ke).toBeCloseTo(168, 6)
    expect(tmaxFor(k.ka, k.ke)).toBeCloseTo(56, 4)
    expect(k.ka).toBeGreaterThan(k.ke)
  })

  it('solves very fast kinetics (tesamorelin: 11 min half-life, 9 min peak)', () => {
    const k = rateConstants({ halfLifeHours: 0.183, tmaxHours: 0.15 })
    expect(tmaxFor(k.ka, k.ke)).toBeCloseTo(0.15, 6)
  })

  it('solves flip-flop kinetics when the peak is later than 1/ke', () => {
    const k = rateConstants({ halfLifeHours: 1, tmaxHours: 5 })
    expect(k.ka).toBeLessThan(k.ke)
    expect(tmaxFor(k.ka, k.ke)).toBeCloseTo(5, 4)
  })

  it('rejects non-positive parameters', () => {
    expect(() => rateConstants({ halfLifeHours: 0, tmaxHours: 1 })).toThrow(RangeError)
  })
})

describe('single dose curve', () => {
  const k = rateConstants({ halfLifeHours: 120, tmaxHours: 24 })

  it('is zero before the dose and peaks at tmax', () => {
    expect(singleDoseAmount(5, 0, k)).toBe(0)
    expect(singleDoseAmount(5, -3, k)).toBe(0)
    const atPeak = singleDoseAmount(5, 24, k)
    expect(atPeak).toBeGreaterThan(singleDoseAmount(5, 20, k))
    expect(atPeak).toBeGreaterThan(singleDoseAmount(5, 28, k))
    expect(atPeak).toBeLessThan(5)
  })

  it('decays by half per half-life once absorption is complete', () => {
    const a = singleDoseAmount(5, 600, k)
    const b = singleDoseAmount(5, 720, k)
    expect(b / a).toBeCloseTo(0.5, 3)
  })
})

describe('superposition and sampling', () => {
  const params = { halfLifeHours: 168, tmaxHours: 56 }
  const k = rateConstants(params)

  it('adds weekly doses together (accumulation)', () => {
    const doses = [0, 1, 2, 3].map((w) => ({ at: w * 168 * H, amount: 1 }))
    const single = amountAt(3 * 168 * H + 56 * H, [doses[3]!], k)
    const total = amountAt(3 * 168 * H + 56 * H, doses, k)
    expect(total).toBeGreaterThan(single * 1.5)
  })

  it('captures a short peak that a coarse grid would miss', () => {
    const tes = { halfLifeHours: 0.183, tmaxHours: 0.15 }
    const kTes = rateConstants(tes)
    const doses = [{ at: 0, amount: 2 }]
    const points = simulate(doses, tes, { start: -24 * H, end: 24 * H }, 48)
    const max = Math.max(...points.map((p) => p.amount))
    expect(max).toBeCloseTo(singleDoseAmount(2, 0.15, kTes), 3)
  })

  it('returns sorted, unique sample times inside the window', () => {
    const points = simulate([{ at: 10 * H, amount: 1 }], params, { start: 0, end: 500 * H })
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.at).toBeGreaterThan(points[i - 1]!.at)
    }
    expect(points[0]!.at).toBe(0)
    expect(points.at(-1)!.at).toBe(500 * H)
  })

  it('projects five half-lives past now', () => {
    const now = 1000 * H
    const w = chartWindow([{ at: now - 24 * H, amount: 1 }], params, now)
    expect(w.end - now).toBeGreaterThanOrEqual(5 * 168 * H)
    expect(w.start).toBeLessThanOrEqual(now - 24 * H)
  })

  it('caps the lookback window when asked', () => {
    const now = 1000 * H
    const w = chartWindow([{ at: now - 400 * H, amount: 1 }], params, now, 168)
    expect(w.start).toBe(now - 168 * H)
  })
})

describe('summarizeLevels', () => {
  const params = { halfLifeHours: 24, tmaxHours: 4 }
  const dose = { at: 0, amount: 100 }

  it('finds the peak near tmax and the drop below 10% of it', () => {
    const points = simulate([dose], params, { start: 0, end: 240 * H })
    const s = summarizeLevels(points, [dose], params, 48 * H)
    expect(s.peak!.at / H).toBeCloseTo(4, 0)
    expect(s.now).toBeCloseTo(amountAt(48 * H, [dose], rateConstants(params)))
    expect(s.clearsAt! / H).toBeGreaterThan(70)
    expect(s.clearsAt! / H).toBeLessThan(90)
  })

  it('has no peak or clearing time when nothing was dosed', () => {
    expect(summarizeLevels([{ at: 0, amount: 0 }], [], params, 0)).toEqual({
      now: 0,
      peak: null,
      clearsAt: null,
    })
  })
})

describe('steady state', () => {
  /** The sum the closed form replaces, taken far enough back that older doses add nothing. */
  const superposed = (hours: number, interval: number, k: { ka: number; ke: number }) => {
    let total = 0
    for (let n = 0; n < 4000; n++) total += singleDoseAmount(1, hours + n * interval, k)
    return total
  }

  it.each([
    ['ordinary absorption', 168, rateConstants({ halfLifeHours: 168, tmaxHours: 56 })],
    ['flip-flop kinetics', 24, rateConstants({ halfLifeHours: 4, tmaxHours: 30 })],
    ['equal rate constants', 24, { ka: 0.05, ke: 0.05 }],
  ])('matches explicit superposition with %s', (_, interval, k) => {
    for (const fraction of [0.1, 0.4, 0.8, 1]) {
      const hours = interval * fraction
      expect(steadyAmount(1, hours, interval, k)).toBeCloseTo(superposed(hours, interval, k), 8)
    }
  })

  it('doubles a weekly dose of a medicine with a one-week half-life, near enough', () => {
    const k = rateConstants({ halfLifeHours: 168, tmaxHours: 56 })
    const { peak, trough } = steadyLevels(1, 168, k)
    expect(peak).toBeGreaterThan(trough)
    // Trough over a dose's own decay at one interval: the textbook 1 / (1 - 2^-1).
    expect(trough / singleDoseAmount(1, 168, k)).toBeCloseTo(2, 0)
  })

  it('finds the highest point of the interval', () => {
    const k = rateConstants({ halfLifeHours: 120, tmaxHours: 24 })
    const { peak, peakHours } = steadyLevels(1, 168, k)
    for (let h = 0; h <= 168; h += 0.5) {
      expect(steadyAmount(1, h, 168, k)).toBeLessThanOrEqual(peak + 1e-9)
    }
    expect(peakHours).toBeGreaterThan(0)
    expect(peakHours).toBeLessThan(24)
  })

  it('scales with the dose', () => {
    const k = rateConstants({ halfLifeHours: 168, tmaxHours: 56 })
    expect(steadyLevels(2.4, 168, k).peak).toBeCloseTo(steadyLevels(1, 168, k).peak * 2.4, 9)
  })
})
