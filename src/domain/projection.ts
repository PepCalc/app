/**
 * Where levels are heading if a schedule continues: the logged history, then the same dose
 * repeated at the chosen interval until the curve settles. This restates the user's own schedule
 * through the model in `pk.ts`; it never suggests a dose, an interval or a change.
 *
 * The model is linear, so a regular schedule always settles on a plateau. "Steady" is the first
 * dose whose peak lands within STEADY_TOLERANCE of that plateau's peak. Peaks rather than troughs,
 * because a short half-life leaves troughs near zero whatever the schedule.
 */
import type { LevelsModel } from './levels'
import {
  amountAt,
  rateConstants,
  simulate,
  singleDoseAmount,
  steadyLevels,
  summarizeLevels,
  tmaxFor,
  type DoseEvent,
  type PkParameters,
  type PkPoint,
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
  intervalHours: number
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

/** The next dose: on schedule after the last one, or now when that time has passed. */
function firstPlannedAt(history: readonly DoseEvent[], intervalHours: number, now: number): number {
  const last = history[history.length - 1]
  return last ? Math.max(now, last.at + intervalHours * HOUR_MS) : now
}

function plannedDoses(start: number, amount: number, intervalHours: number): DoseEvent[] {
  const intervalMs = intervalHours * HOUR_MS
  const count = Math.min(
    MAX_PLANNED_DOSES,
    Math.ceil((MAX_PROJECTION_WEEKS * WEEK_MS) / intervalMs),
  )
  return Array.from({ length: count }, (_, i) => ({ at: start + i * intervalMs, amount }))
}

/** History from the first dose still in view, or a sliver before the first planned dose. */
function windowStart(history: readonly DoseEvent[], start: number, now: number, end: number) {
  const reach = (end - now) * HISTORY_SHARE
  const first = history[0]?.at ?? start
  return Math.max(Math.min(first, now), now - reach)
}

/**
 * The curve from the logged history through the planned schedule, with its plateau and when
 * levels reach it. Returns the same model as a levels chart: `logged` stops at now, `projected`
 * carries on from it, so the two meet there. With no `amount` the last logged dose repeats.
 */
export function projectLevels(input: ProjectionInput): LevelProjection {
  const { params, intervalHours, history, now } = input
  const k = rateConstants(params)
  const known = input.amount ?? history[history.length - 1]?.amount ?? null
  const unit = steadyLevels(1, intervalHours, k)
  const amount = known ?? 100 / unit.peak
  const plateau = steadyLevels(amount, intervalHours, k)
  const peakMs = plateau.peakHours * HOUR_MS
  const intervalMs = intervalHours * HOUR_MS

  const start = firstPlannedAt(history, intervalHours, now)
  const schedule = plannedDoses(start, amount, intervalHours)
  const peakOf = (i: number) => {
    const taken = [...history, ...schedule.slice(0, i + 1)]
    return amountAt(schedule[i]!.at + peakMs, taken, k)
  }
  const settled = (peak: number) => Math.abs(peak - plateau.peak) <= STEADY_TOLERANCE * plateau.peak
  const steadyIndex = schedule.findIndex((_, i) => settled(peakOf(i)))

  const lastDose = schedule[schedule.length - 1]!
  const outlook = outlookFor(steadyIndex, schedule, history.length > 0, peakMs, {
    end: lastDose.at + intervalMs,
    rising: peakOf(schedule.length - 1) < plateau.peak,
  })
  const shortest = now + MIN_INTERVALS * intervalMs
  const end =
    steadyIndex < 0
      ? lastDose.at + intervalMs
      : Math.max(shortest, schedule[steadyIndex]!.at + (SETTLED_INTERVALS + 1) * intervalMs)

  const planned = schedule.filter((d) => d.at < end)
  const allDoses = [...history, ...planned]
  const window = { start: windowStart(history, start, now, end), end }
  const intervalSamples = Math.min(
    MAX_INTERVAL_SAMPLES,
    Math.max(MIN_INTERVAL_SAMPLES, Math.floor(SAMPLE_BUDGET / planned.length)),
  )
  const projected = simulate(
    allDoses,
    params,
    { start: now, end },
    120,
    intervalSamples,
    intervalHours,
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
    plateau: { peak: plateau.peak, trough: plateau.trough },
    buildUp: plateau.peak / singleDoseAmount(amount, tmaxFor(k.ka, k.ke), k),
  }
}

function outlookFor(
  steadyIndex: number,
  schedule: readonly DoseEvent[],
  hasHistory: boolean,
  peakMs: number,
  cutOff: { end: number; rising: boolean },
): SteadyOutlook {
  if (steadyIndex < 0) return { kind: 'cut-off', at: cutOff.end, rising: cutOff.rising }
  if (steadyIndex > 0) return { kind: 'by', at: schedule[steadyIndex]!.at + peakMs }
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
