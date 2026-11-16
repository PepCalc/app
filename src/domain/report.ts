import {
  chartWindow,
  lookbackHoursFor,
  type DoseEvent,
  type PkParameters,
  type SimulationWindow,
} from './pk'

/** How far back a report reaches. */
export type ReportPeriod = '30d' | '90d' | 'all'

const MS_PER_DAY = 86_400_000

/** First instant a report covers, or -Infinity for everything. */
export function periodStart(period: ReportPeriod, now: number): number {
  if (period === 'all') return -Infinity
  return now - (period === '30d' ? 30 : 90) * MS_PER_DAY
}

export interface ReportWindow extends SimulationWindow {
  /** True when a short-acting product's chart shows only the days up to its latest dose. */
  trimmed: boolean
}

/**
 * The span a report's level chart shows: from shortly before the first dose in the period to
 * the same forward horizon as the in-app chart (five half-lives, or longer for slow absorption).
 * Short-acting products follow the in-app lookback (`lookbackHoursFor`), counted back from their
 * latest dose so a report made days later still shows the pattern. Doses before the window
 * still count towards the curve; the window just starts later.
 */
export function reportWindow(
  doses: readonly DoseEvent[],
  params: PkParameters,
  now: number,
  since: number,
): ReportWindow {
  const { end } = chartWindow(doses, params, now)
  const first = doses.find((d) => d.at >= since)?.at ?? now
  const lead = Math.max(params.tmaxHours * 3_600_000 * 0.25, 30 * 60_000)
  const start = first - lead
  const lookback = lookbackHoursFor(params)
  const latest = doses.reduce((max, d) => Math.max(max, d.at), -Infinity)
  if (lookback === undefined || !Number.isFinite(latest)) return { start, end, trimmed: false }
  const recent = latest - lookback * 3_600_000
  return recent > start ? { start: recent, end, trimmed: true } : { start, end, trimmed: false }
}

/**
 * Round axis ticks from 0 to at least `max`: steps of 1, 2, 2.5 or 5 times a power of ten,
 * about `target` intervals. Returns at least [0, 1] for a zero or negative max.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!
  const ticks: number[] = []
  for (let v = 0; v < max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)))
  if (ticks[ticks.length - 1]! < max) ticks.push(Number((ticks.length * step).toPrecision(12)))
  return ticks
}

/**
 * Round axis ticks spanning `min` to `max`, about `target` steps of 1, 2, 2.5 or 5 times a
 * power of ten, with the range widened to whole steps. A flat series gets a band around it.
 * Unlike `niceTicks` it need not start at zero, for body measures such as weight.
 */
export function niceRange(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (max - min < 1e-9) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!
  const from = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = from; v < max + step - step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}
