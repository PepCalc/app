import { describe, expect, it } from 'vitest'
import { amountAt, rateConstants, type DoseEvent } from '@/domain/pk'
import { curveTrace, levelTrace, projectLevels } from '@/domain/projection'
import { levelsModel } from '@/domain/levels'
import { projectedDoseTimes, type LocalCalendar, type Weekday } from '@/domain/schedule'

const H = 3_600_000
const DAY = 24 * H
const WEEK = 168 * H
const NOW = Date.UTC(2026, 10, 6, 12)

const SEMAGLUTIDE = { halfLifeHours: 168, tmaxHours: 56 }
const TESAMORELIN = { halfLifeHours: 0.5, tmaxHours: 0.15 }
const VERY_LONG = { halfLifeHours: 2000, tmaxHours: 24 }

const utcCal: LocalCalendar = {
  atLocalTime(epochMs, dayOffset, hour, minute) {
    const d = new Date(epochMs)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, hour, minute)
  },
  weekdayOf(epochMs) {
    const d = new Date(epochMs).getUTCDay()
    return (d === 0 ? 7 : d) as Weekday
  },
  daysSince(from, epochMs) {
    const [y, m, day] = from.split('-').map(Number)
    const d = new Date(epochMs)
    return Math.round(
      (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y!, m! - 1, day!)) /
        DAY,
    )
  },
}

const weekly = (count: number, amount: number, lastAt = NOW - 2 * DAY): DoseEvent[] =>
  Array.from({ length: count }, (_, i) => ({ at: lastAt - (count - 1 - i) * WEEK, amount }))

const every = (intervalHours: number, history: readonly DoseEvent[] = []): number[] =>
  projectedDoseTimes(
    { kind: 'interval', everyHours: intervalHours },
    history.length ? history[history.length - 1]!.at : null,
    NOW,
    NOW,
    utcCal,
  )

describe('projectLevels', () => {
  it('reaches a steady state in four to five weeks on weekly semaglutide, as labelled', () => {
    const p = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: every(168),
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
      doseTimes: every(168),
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
      projectLevels({ params: SEMAGLUTIDE, doseTimes: every(168), amount, history: [], now: NOW })
    expect(at(0.25).outlook).toEqual(at(2.4).outlook)
    expect(at(2.4).plateau.peak).toBeCloseTo(at(0.25).plateau.peak * 9.6, 6)
    expect(at(0.25).buildUp).toBeCloseTo(at(2.4).buildUp, 6)
  })

  it('finds no build-up when each dose clears before the next, and still shows the rhythm', () => {
    const p = projectLevels({
      params: TESAMORELIN,
      doseTimes: every(24),
      amount: null,
      history: [],
      now: NOW,
    })
    expect(p.outlook.kind).toBe('immediate')
    expect(p.buildUp).toBeCloseTo(1, 3)
    expect(p.window.end - NOW).toBeGreaterThanOrEqual(4 * DAY)
  })

  it('stops at sixteen weeks and says so when levels are still rising', () => {
    const p = projectLevels({
      params: VERY_LONG,
      doseTimes: every(24),
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
      doseTimes: every(0.25),
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(p.allDoses.length).toBeLessThanOrEqual(240)
    expect(p.outlook.kind).toBe('cut-off')
    expect(p.projected.length).toBeLessThan(3000)
  })

  it('reads steady now after enough regular doses', () => {
    const history = weekly(12, 1)
    const p = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: every(168, history),
      amount: null,
      history,
      now: NOW,
    })
    expect(p.outlook.kind).toBe('now')
    expect(p.relative).toBe(false)
  })

  it('repeats the last logged dose on schedule when no dose is given', () => {
    const history = weekly(3, 0.5)
    const p = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: every(168, history),
      amount: null,
      history,
      now: NOW,
    })
    expect(p.allDoses[3]).toEqual({ at: history[2]!.at + WEEK, amount: 0.5 })
  })

  it('starts from now when the next dose is overdue', () => {
    const history = weekly(3, 1, NOW - 10 * DAY)
    const p = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: every(168, history),
      amount: null,
      history,
      now: NOW,
    })
    expect(p.allDoses[3]!.at).toBe(NOW)
  })

  it('settles downward after a step down', () => {
    const history = weekly(12, 2)
    const p = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: every(168, history),
      amount: 0.5,
      history,
      now: NOW,
    })
    expect(p.outlook.kind).toBe('by')
    expect(p.projected[0]!.amount).toBeGreaterThan(p.plateau.peak)
  })

  it('says levels are still falling when a long half-life outlasts the projection', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      at: NOW - (60 - i) * DAY,
      amount: 4,
    }))
    const p = projectLevels({
      params: VERY_LONG,
      doseTimes: every(24, history),
      amount: 0.1,
      history,
      now: NOW,
    })
    expect(p.outlook).toMatchObject({ kind: 'cut-off', rising: false })
  })

  it('joins history and projection at now, and keeps history behind it', () => {
    const history = weekly(6, 1)
    const params = SEMAGLUTIDE
    const p = projectLevels({
      params,
      doseTimes: every(168, history),
      amount: null,
      history,
      now: NOW,
    })
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
      doseTimes: every(168),
      amount: 1,
      history: [],
      now: NOW,
    })
    const highest = Math.max(...p.projected.map((x) => x.amount))
    expect(highest / p.plateau.peak).toBeGreaterThan(0.95)
    expect(highest / p.plateau.peak).toBeLessThan(1.0001)
  })

  it('projects irregular schedules such as Mon/Wed/Fri and 5-on/2-off cycles', () => {
    const mwfTimes = projectedDoseTimes(
      { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] },
      null,
      NOW,
      NOW,
      utcCal,
    )
    const mwf = projectLevels({
      params: { halfLifeHours: 24, tmaxHours: 2 },
      doseTimes: mwfTimes,
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(mwf.outlook.kind).not.toBe('cut-off')
    expect(mwf.plateau.peak).toBeGreaterThan(0.5)

    const empty = projectLevels({
      params: SEMAGLUTIDE,
      doseTimes: [],
      amount: 1,
      history: [],
      now: NOW,
    })
    expect(empty.projected).toEqual([])
  })
})

describe('levelTrace', () => {
  const steady = (params = SEMAGLUTIDE, intervalHours = 168) => {
    const history = weekly(10, 1)
    return projectLevels({
      params,
      doseTimes: every(intervalHours, history),
      amount: null,
      history,
      now: NOW,
    })
  }

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
      doseTimes: every(24),
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
      doseTimes: every(168),
      amount: null,
      history: [],
      now: NOW,
    })
    const trace = levelTrace(p, NOW)
    expect(trace.past).toEqual([])
    expect(trace.now[0]).toBe(0)
  })
})

describe('curveTrace', () => {
  it('scales a levels curve into [0, 1] and reaches 1 at its peak', () => {
    const model = levelsModel({
      params: SEMAGLUTIDE,
      doses: [{ at: NOW - DAY, amount: 1 }],
      preview: null,
      unitLabel: 'mg',
      now: NOW,
    })
    const points = curveTrace(model)
    expect(points.length).toBeGreaterThan(2)
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...points.map(([, y]) => y))).toBeCloseTo(1, 3)
  })

  it('is empty when there are no logged points', () => {
    expect(curveTrace({ window: { start: 0, end: 100 }, logged: [] })).toEqual([])
  })
})
