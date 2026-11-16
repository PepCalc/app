/**
 * Where levels are heading if a schedule continues: the logged history, then the same dose
 * repeated at the upcoming dose times until the curve settles. This restates the user's own
 * schedule through the model in `pk.ts`; it never suggests a dose, an interval or a change.
 *
 * The model is linear, so a repeating schedule always settles on a steady rhythm. "Steady" is the
 * first planned dose whose peak lands within STEADY_TOLERANCE of that rhythm's asymptotic peak at
 * the same phase. Peaks rather than troughs, because a short half-life leaves troughs near zero
 * whatever the schedule.
 */
import type { LevelsModel } from './levels'
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
  type DoseEvent,
  type PkParameters,
  type PkPoint,
  type RateConstants,
} from './pk'

/** 5% of the plateau is about 4.3 half-lives, within the usual four to five. */
const STEADY_TOLERANCE = 0.05
/** A very long half-life settles after months; past this the chart stops and says so. */
const MAX_PROJECTION_WEEKS = 16
/** Intervals can be fractions of an hour, so the schedule's length is capped as well. */
const MAX_PLANNED_DOSES = 240
/** Enough repeats to show the rhythm when levels settle at once. */
const MIN_INTERVALS = 4
/** The plateau stays in view for this many intervals after levels reach it. */
const SETTLED_INTERVALS = 2
/** History shown, as a share of the projection's length: enough to read the trend into "now". */
const HISTORY_SHARE = 0.6

const HOUR_MS = 3_600_000
const WEEK_MS = 168 * HOUR_MS
const DST_TOLERANCE_MS = 1.5 * HOUR_MS

/** Samples across the whole projection, shared between its intervals. */
const SAMPLE_BUDGET = 720
const MIN_INTERVAL_SAMPLES = 6
const MAX_INTERVAL_SAMPLES = 40

export type SteadyOutlook =
  /** Peaks already match the plateau. */
  | { kind: 'now' }
  /** The first dose reaches the plateau: nothing carries over between doses. */
  | { kind: 'immediate' }
  | { kind: 'by'; at: number }
  /** The projection stopped first, at `at`, with levels still moving. */
  | { kind: 'cut-off'; at: number; rising: boolean }

export interface ProjectionInput {
  params: PkParameters
  /** Upcoming dose times, oldest first (epoch ms). Empty when nothing is scheduled. */
  doseTimes: readonly number[]
  /** The dose the schedule repeats; null without one, and the result reads in percent. */
  amount: number | null
  /** Logged doses, oldest first. */
  history: readonly DoseEvent[]
  now: number
}

export interface LevelProjection extends LevelsModel {
  /** Amounts are percent of the plateau's peak, because no dose is known. */
  relative: boolean
  outlook: SteadyOutlook
  plateau: { peak: number; trough: number }
  /** Plateau peak as a multiple of one dose's own peak: how much builds up between doses. */
  buildUp: number
}

/** History from the first dose still in view, or a sliver before the first planned dose. */
function windowStart(history: readonly DoseEvent[], start: number, now: number, end: number) {
  const reach = (end - now) * HISTORY_SHARE
  const first = history[0]?.at ?? start
  return Math.max(Math.min(first, now), now - reach)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

interface SteadyPattern {
  avgGapMs: number
  /** Unit-dose asymptotic peak and trough across the whole repeating cycle. */
  unitPeak: number
  unitTrough: number
  /** Unit-dose peak and peak offset (hours) for planned dose index `i`. */
  phaseAt(index: number): { unitPeak: number; peakOffsetHours: number }
}

/** Finds the shortest repeating period length in `gaps` (allowing 1.5h for DST), or null. */
function detectPeriod(gaps: readonly number[]): number | null {
  const maxPeriod = Math.floor(gaps.length / 2)
  for (let period = 1; period <= maxPeriod; period++) {
    let matches = true
    for (let i = 0; i < gaps.length - period; i++) {
      if (Math.abs(gaps[i]! - gaps[i + period]!) > DST_TOLERANCE_MS) {
        matches = false
        break
      }
    }
    if (matches) return period
  }
  return null
}

function buildPattern(times: readonly number[], k: RateConstants): SteadyPattern {
  if (times.length < 2) {
    const peakHours = tmaxFor(k.ka, k.ke)
    const unitPeak = singleDoseAmount(1, peakHours, k)
    return {
      avgGapMs: 24 * HOUR_MS,
      unitPeak,
      unitTrough: 0,
      phaseAt: () => ({ unitPeak, peakOffsetHours: peakHours }),
    }
  }

  const gaps = Array.from({ length: times.length - 1 }, (_, i) => times[i + 1]! - times[i]!)
  const period = detectPeriod(gaps)
  if (period === null || period === 1) {
    const gapMs =
      period === 1 ? median(gaps) : (times[times.length - 1]! - times[0]!) / (times.length - 1)
    const intervalHours = gapMs / HOUR_MS
    const unit = steadyLevels(1, intervalHours, k)
    return {
      avgGapMs: gapMs,
      unitPeak: unit.peak,
      unitTrough: unit.trough,
      phaseAt: () => ({ unitPeak: unit.peak, peakOffsetHours: unit.peakHours }),
    }
  }

  // Multi-dose repeating pattern (e.g. Mon/Wed/Fri or 5-on/2-off): sum steadyAmount over each dose in the cycle.
  const cycleGapsMs = Array.from({ length: period }, (_, j) => {
    const samples: number[] = []
    for (let i = j; i < gaps.length; i += period) samples.push(gaps[i]!)
    return median(samples)
  })
  const periodMs = cycleGapsMs.reduce((a, b) => a + b, 0)
  const periodHours = periodMs / HOUR_MS
  const offsetsHours: number[] = [0]
  for (let j = 0; j < period - 1; j++) {
    offsetsHours.push(offsetsHours[j]! + cycleGapsMs[j]! / HOUR_MS)
  }

  const cycleAmount = (hours: number) => {
    let total = 0
    for (const o of offsetsHours) {
      const h = (((hours - o) % periodHours) + periodHours) % periodHours
      total += steadyAmount(1, h, periodHours, k)
    }
    return total
  }

  const phases = offsetsHours.map((o, j) => {
    const spanHours = cycleGapsMs[j]! / HOUR_MS
    let lo = o
    let hi = o + spanHours
    for (let iter = 0; iter < 60; iter++) {
      const third = (hi - lo) / 3
      if (cycleAmount(lo + third) < cycleAmount(hi - third)) lo += third
      else hi -= third
    }
    const peakHour = (lo + hi) / 2
    return {
      unitPeak: cycleAmount(peakHour),
      peakOffsetHours: peakHour - o,
      unitTrough: cycleAmount(o),
    }
  })

  const unitPeak = Math.max(...phases.map((p) => p.unitPeak))
  const unitTrough = Math.min(...phases.map((p) => p.unitTrough))
  return {
    avgGapMs: periodMs / period,
    unitPeak,
    unitTrough,
    phaseAt: (i) => {
      const p = phases[i % period]!
      return { unitPeak: p.unitPeak, peakOffsetHours: p.peakOffsetHours }
    },
  }
}

/**
 * The curve from the logged history through the planned schedule, with its plateau and when
 * levels reach it. Returns the same model as a levels chart: `logged` stops at now, `projected`
 * carries on from it, so the two meet there. With no `amount` the last logged dose repeats.
 */
export function projectLevels(input: ProjectionInput): LevelProjection {
  const { params, history, now } = input
  const k = rateConstants(params)
  const known = input.amount ?? history[history.length - 1]?.amount ?? null
  const futureTimes = [...input.doseTimes]
    .filter((t) => t >= now)
    .sort((a, b) => a - b)
    .slice(0, MAX_PLANNED_DOSES)

  if (!futureTimes.length) {
    const window = chartWindow(history, params, now)
    const logged = history.length
      ? simulate(history, params, { start: window.start, end: now })
      : []
    return {
      window,
      allDoses: [...history],
      logged,
      projected: [],
      summary: summarizeLevels(logged, history, params, now),
      relative: known === null,
      outlook: { kind: history.length ? 'now' : 'immediate' },
      plateau: { peak: 0, trough: 0 },
      buildUp: 1,
    }
  }

  const pattern = buildPattern(futureTimes, k)
  const amount = known ?? 100 / pattern.unitPeak
  const plateau = { peak: pattern.unitPeak * amount, trough: pattern.unitTrough * amount }
  const schedule: DoseEvent[] = futureTimes.map((at) => ({ at, amount }))

  const peakOf = (i: number) => {
    const { peakOffsetHours } = pattern.phaseAt(i)
    const taken = [...history, ...schedule.slice(0, i + 1)]
    return amountAt(schedule[i]!.at + peakOffsetHours * HOUR_MS, taken, k)
  }
  const targetPeakOf = (i: number) => pattern.phaseAt(i).unitPeak * amount
  const settled = (i: number) =>
    Math.abs(peakOf(i) - targetPeakOf(i)) <= STEADY_TOLERANCE * targetPeakOf(i)
  const steadyIndex = schedule.findIndex((_, i) => settled(i))

  const lastDose = schedule[schedule.length - 1]!
  const tailMs = pattern.avgGapMs
  const outlook = outlookFor(
    steadyIndex,
    schedule,
    history.length > 0,
    (i) => pattern.phaseAt(i).peakOffsetHours * HOUR_MS,
    {
      end: Math.min(now + MAX_PROJECTION_WEEKS * WEEK_MS, lastDose.at + tailMs),
      rising: peakOf(schedule.length - 1) < targetPeakOf(schedule.length - 1),
    },
  )
  const shortest = now + MIN_INTERVALS * pattern.avgGapMs
  const end =
    steadyIndex < 0
      ? lastDose.at + tailMs
      : Math.max(shortest, schedule[steadyIndex]!.at + (SETTLED_INTERVALS + 1) * pattern.avgGapMs)

  const planned = schedule.filter((d) => d.at < end)
  const allDoses = [...history, ...planned]
  const window = { start: windowStart(history, schedule[0]!.at, now, end), end }
  const intervalSamples = Math.min(
    MAX_INTERVAL_SAMPLES,
    Math.max(MIN_INTERVAL_SAMPLES, Math.floor(SAMPLE_BUDGET / Math.max(1, planned.length))),
  )
  const projected = simulate(
    allDoses,
    params,
    { start: now, end },
    120,
    intervalSamples,
    pattern.avgGapMs / HOUR_MS,
  )
  const logged = history.length ? simulate(history, params, { start: window.start, end: now }) : []
  return {
    window,
    allDoses,
    logged,
    projected,
    summary: summarizeLevels(projected, allDoses, params, now),
    relative: known === null,
    outlook,
    plateau,
    buildUp: plateau.peak / singleDoseAmount(amount, tmaxFor(k.ka, k.ke), k),
  }
}

function outlookFor(
  steadyIndex: number,
  schedule: readonly DoseEvent[],
  hasHistory: boolean,
  peakMsFor: (i: number) => number,
  cutOff: { end: number; rising: boolean },
): SteadyOutlook {
  if (steadyIndex < 0) return { kind: 'cut-off', at: cutOff.end, rising: cutOff.rising }
  if (steadyIndex > 0) return { kind: 'by', at: schedule[steadyIndex]!.at + peakMsFor(steadyIndex) }
  return { kind: hasHistory ? 'now' : 'immediate' }
}

/** One line of a level trace, as x and y from 0 to 1 with y measured up from the baseline. */
export type TracePoint = readonly [x: number, y: number]

export interface LevelTrace {
  past: TracePoint[]
  future: TracePoint[]
  now: TracePoint
}

/** Each bucket keeps its lowest and highest point in time order, so short peaks survive. */
function thin(points: readonly PkPoint[], buckets: number, start: number, span: number): PkPoint[] {
  const kept = new Map<number, { low: PkPoint; high: PkPoint }>()
  for (const p of points) {
    const bucket = Math.min(buckets - 1, Math.floor(((p.at - start) / span) * buckets))
    const held = kept.get(bucket)
    if (!held) kept.set(bucket, { low: p, high: p })
    else {
      if (p.amount < held.low.amount) held.low = p
      if (p.amount > held.high.amount) held.high = p
    }
  }
  const thinned = [...kept.values()].flatMap(({ low, high }) =>
    low === high ? [low] : low.at < high.at ? [low, high] : [high, low],
  )
  const first = points[0]
  const last = points[points.length - 1]
  return [...new Set([first, ...thinned, last])].filter((p) => p !== undefined)
}

/**
 * A projection reduced to the few hundred points a small drawing can show. Scaled to its own
 * highest point from a zero baseline, so a line near the top means near the highest level in
 * view, never a level compared with another peptide.
 */
export function levelTrace(projection: LevelProjection, now: number, buckets = 120): LevelTrace {
  const { window, logged, projected } = projection
  const span = window.end - window.start
  const highest = Math.max(...logged.map((p) => p.amount), ...projected.map((p) => p.amount), 1e-9)
  const scale = (p: PkPoint): TracePoint => [(p.at - window.start) / span, p.amount / highest]
  const thinned = (points: readonly PkPoint[]) =>
    thin(points, buckets, window.start, span).map(scale)
  const nowPoint = projected[0] ?? logged[logged.length - 1]
  return {
    past: thinned(logged),
    future: thinned(projected),
    now: nowPoint ? scale(nowPoint) : [(now - window.start) / span, 0],
  }
}

/**
 * A levels curve reduced to normalized [x, y] points in [0, 1] for a compact inline trace,
 * scaled from 0 up to the curve's peak so height reflects the share of peak.
 */
export function curveTrace(
  model: Pick<LevelsModel, 'window' | 'logged'>,
  buckets = 48,
): TracePoint[] {
  const { window, logged } = model
  const span = window.end - window.start
  if (!logged.length || !(span > 0)) return []
  const peak = Math.max(...logged.map((p) => p.amount), 1e-9)
  return thin(logged, buckets, window.start, span).map((p) => [
    (p.at - window.start) / span,
    p.amount / peak,
  ])
}
