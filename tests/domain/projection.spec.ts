import { describe, expect, it } from 'vitest'
import { amountAt, rateConstants, type DoseEvent } from '@/domain/pk'
import { levelTrace, projectLevels } from '@/domain/projection'

const H = 3_600_000
const WEEK = 168 * H
const NOW = Date.UTC(2026, 10, 6, 12)

const SEMAGLUTIDE = { halfLifeHours: 168, tmaxHours: 56 }
const TESAMORELIN = { halfLifeHours: 0.5, tmaxHours: 0.15 }
const VERY_LONG = { halfLifeHours: 2000, tmaxHours: 24 }

const weekly = (count: number, amount: number, lastAt = NOW - 2 * 24 * H): DoseEvent[] =>
  Array.from({ length: count }, (_, i) => ({ at: lastAt - (count - 1 - i) * WEEK, amount }))

describe('projectLevels', () => {
  it('reaches a steady state in four to five weeks on weekly semaglutide, as labelled', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(p.outlook.kind).toBe('by')
    const weeks = p.outlook.kind === 'by' ? (p.outlook.at - NOW) / WEEK : 0
    expect(weeks).toBeGreaterThanOrEqual(4)
    expect(weeks).toBeLessThanOrEqual(5)
  })

  it('reads in percent of the steady peak without a dose', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: null,
      history: [],
      now: NOW,
    })
    expect(p.relative).toBe(true)
    expect(p.plateau.peak).toBeCloseTo(100, 6)
    expect(Math.max(...p.projected.map((x) => x.amount))).toBeLessThanOrEqual(100.001)
  })

  it('reaches the same steady date whatever the dose, because the model is linear', () => {
    const at = (amount: number) =>
      projectLevels({ params: SEMAGLUTIDE, intervalHours: 168, amount, history: [], now: NOW })
    expect(at(0.25).outlook).toEqual(at(2.4).outlook)
    expect(at(2.4).plateau.peak).toBeCloseTo(at(0.25).plateau.peak * 9.6, 6)
    expect(at(0.25).buildUp).toBeCloseTo(at(2.4).buildUp, 6)
  })

  it('finds no build-up when each dose clears before the next, and still shows the rhythm', () => {
    const p = projectLevels({
      params: TESAMORELIN,
      intervalHours: 24,
      amount: null,
      history: [],
      now: NOW,
    })
    expect(p.outlook.kind).toBe('immediate')
    expect(p.buildUp).toBeCloseTo(1, 3)
    expect(p.window.end - NOW).toBeGreaterThanOrEqual(4 * 24 * H)
  })

  it('stops at sixteen weeks and says so when levels are still rising', () => {
    const p = projectLevels({
      params: VERY_LONG,
      intervalHours: 24,
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(p.outlook).toMatchObject({ kind: 'cut-off', rising: true })
    expect(p.window.end).toBe(NOW + 16 * WEEK)
  })

  it('caps the schedule when the interval is a fraction of an hour', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 0.25,
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(p.allDoses.length).toBeLessThanOrEqual(240)
    expect(p.outlook.kind).toBe('cut-off')
    expect(p.projected.length).toBeLessThan(3000)
  })

  it('reads steady now after enough regular doses', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: null,
      history: weekly(12, 1),
      now: NOW,
    })
    expect(p.outlook.kind).toBe('now')
    expect(p.relative).toBe(false)
  })

  it('repeats the last logged dose on schedule when no dose is given', () => {
    const history = weekly(3, 0.5)
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: null,
      history,
      now: NOW,
    })
    expect(p.allDoses[3]).toEqual({ at: history[2]!.at + WEEK, amount: 0.5 })
  })

  it('starts from now when the next dose is overdue', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: null,
      history: weekly(3, 1, NOW - 10 * 24 * H),
      now: NOW,
    })
    expect(p.allDoses[3]!.at).toBe(NOW)
  })

  it('settles downward after a step down', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: 0.5,
      history: weekly(12, 2),
      now: NOW,
    })
    expect(p.outlook.kind).toBe('by')
    expect(p.projected[0]!.amount).toBeGreaterThan(p.plateau.peak)
  })

  it('says levels are still falling when a long half-life outlasts the projection', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      at: NOW - (60 - i) * 24 * H,
      amount: 4,
    }))
    const p = projectLevels({
      params: VERY_LONG,
      intervalHours: 24,
      amount: 0.1,
      history,
      now: NOW,
    })
    expect(p.outlook).toMatchObject({ kind: 'cut-off', rising: false })
  })

  it('joins history and projection at now, and keeps history behind it', () => {
    const history = weekly(6, 1)
    const params = SEMAGLUTIDE
    const p = projectLevels({ params, intervalHours: 168, amount: null, history, now: NOW })
    const last = p.logged[p.logged.length - 1]!
    expect(last.at).toBe(NOW)
    expect(p.projected[0]!.at).toBe(NOW)
    expect(p.projected[0]!.amount).toBeCloseTo(last.amount, 9)
    expect(p.summary.now).toBeCloseTo(amountAt(NOW, history, rateConstants(params)), 9)
    expect(p.window.start).toBeLessThan(NOW)
  })

  it('catches the plateau peak in its samples', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: 1,
      history: [],
      now: NOW,
    })
    const highest = Math.max(...p.projected.map((x) => x.amount))
    expect(highest / p.plateau.peak).toBeGreaterThan(0.95)
    expect(highest / p.plateau.peak).toBeLessThan(1.0001)
  })
})

describe('levelTrace', () => {
  const steady = (params = SEMAGLUTIDE, intervalHours = 168) =>
    projectLevels({ params, intervalHours, amount: null, history: weekly(10, 1), now: NOW })

  it('stays within the unit square, with now where history meets the projection', () => {
    const trace = levelTrace(steady(), NOW)
    for (const [x, y] of [...trace.past, ...trace.future]) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
    expect(trace.past[trace.past.length - 1]).toEqual(trace.now)
    expect(trace.future[0]).toEqual(trace.now)
  })

  it('stays small however many samples the curve holds', () => {
    const trace = levelTrace(steady(SEMAGLUTIDE, 12), NOW, 60)
    expect(trace.future.length).toBeLessThanOrEqual(122)
  })

  it('keeps a peak only minutes long', () => {
    const p = projectLevels({
      params: TESAMORELIN,
      intervalHours: 24,
      amount: 1,
      history: [],
      now: NOW,
    })
    const trace = levelTrace(p, NOW, 40)
    expect(Math.max(...trace.future.map(([, y]) => y))).toBe(1)
  })

  it('has an empty past before any dose', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      intervalHours: 168,
      amount: null,
      history: [],
      now: NOW,
    })
    const trace = levelTrace(p, NOW)
    expect(trace.past).toEqual([])
    expect(trace.now[0]).toBe(0)
  })
})
