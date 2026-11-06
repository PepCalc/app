/**
 * One-compartment pharmacokinetic model with first-order absorption and elimination (the
 * Bateman function), superposed over every dose. This is the simplest model that reproduces
 * both a published half-life and a published time-to-peak. The output is an estimated amount
 * of drug in the body expressed in the dose's own unit, NOT a blood concentration: volume of
 * distribution and bioavailability are deliberately left out because they are unknown or
 * uncertain for most of these peptides.
 */

export interface PkParameters {
  halfLifeHours: number
  tmaxHours: number
}

export interface RateConstants {
  /** Absorption rate constant, 1/h. */
  ka: number
  /** Elimination rate constant, 1/h. */
  ke: number
}

export interface DoseEvent {
  /** Epoch milliseconds. */
  at: number
  amount: number
}

export interface PkPoint {
  at: number
  amount: number
}

const MS_PER_HOUR = 3_600_000

/** Time of peak for a single dose given both rate constants. Symmetric in ka and ke. */
export function tmaxFor(ka: number, ke: number): number {
  if (Math.abs(ka - ke) < 1e-12 * Math.max(ka, ke)) return 1 / ke
  return Math.log(ka / ke) / (ka - ke)
}

/**
 * Solve for ka given the half-life and the time of peak. tmax falls monotonically as ka rises,
 * so bisection on log(ka) converges for any positive tmax. When tmax > 1/ke the solution has
 * ka < ke ("flip-flop" kinetics, where absorption is the slower process); the model handles
 * both cases.
 */
export function rateConstants(params: PkParameters): RateConstants {
  const { halfLifeHours, tmaxHours } = params
  if (!(halfLifeHours > 0) || !(tmaxHours > 0)) {
    throw new RangeError('Half-life and time to peak must be positive.')
  }
  const ke = Math.LN2 / halfLifeHours
  let lo = Math.log(ke) - 40
  let hi = Math.log(ke) + 40
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tmaxFor(Math.exp(mid), ke) > tmaxHours) lo = mid
    else hi = mid
  }
  return { ka: Math.exp((lo + hi) / 2), ke }
}

/** Amount remaining in the body `hours` after a single dose of `amount`. */
export function singleDoseAmount(amount: number, hours: number, k: RateConstants): number {
  if (hours <= 0) return 0
  const { ka, ke } = k
  if (Math.abs(ka - ke) < 1e-9 * ke) {
    return amount * ke * hours * Math.exp(-ke * hours)
  }
  return ((amount * ka) / (ka - ke)) * (Math.exp(-ke * hours) - Math.exp(-ka * hours))
}

export function amountAt(at: number, doses: readonly DoseEvent[], k: RateConstants): number {
  let total = 0
  for (const dose of doses) {
    total += singleDoseAmount(dose.amount, (at - dose.at) / MS_PER_HOUR, k)
  }
  return total
}

/**
 * Amount `hours` after a dose once a schedule has run forever: `singleDoseAmount` summed over
 * endless doses `intervalHours` apart, which is a geometric series in each exponential. `hours`
 * runs from 0 (the moment of a dose, before it absorbs) to `intervalHours`.
 */
export function steadyAmount(
  amount: number,
  hours: number,
  intervalHours: number,
  k: RateConstants,
): number {
  const { ka, ke } = k
  const keepE = -Math.expm1(-ke * intervalHours)
  if (Math.abs(ka - ke) < 1e-9 * ke) {
    const carried = (intervalHours * Math.exp(-ke * intervalHours)) / keepE ** 2
    return amount * ke * Math.exp(-ke * hours) * (hours / keepE + carried)
  }
  const keepA = -Math.expm1(-ka * intervalHours)
  return (
    ((amount * ka) / (ka - ke)) * (Math.exp(-ke * hours) / keepE - Math.exp(-ka * hours) / keepA)
  )
}

export interface SteadyLevels {
  /** Highest amount in each interval at steady state. */
  peak: number
  /** Hours after a dose that the peak falls. */
  peakHours: number
  /** Amount just before each dose at steady state. */
  trough: number
}

/**
 * The plateau a regular schedule settles on. One interval of the steady curve has a single
 * maximum, so a ternary search finds it for any ka and ke, flip-flop kinetics included.
 */
export function steadyLevels(
  amount: number,
  intervalHours: number,
  k: RateConstants,
): SteadyLevels {
  let lo = 0
  let hi = intervalHours
  for (let i = 0; i < 80; i++) {
    const third = (hi - lo) / 3
    if (
      steadyAmount(amount, lo + third, intervalHours, k) <
      steadyAmount(amount, hi - third, intervalHours, k)
    ) {
      lo += third
    } else {
      hi -= third
    }
  }
  const peakHours = (lo + hi) / 2
  return {
    peak: steadyAmount(amount, peakHours, intervalHours, k),
    peakHours,
    trough: steadyAmount(amount, 0, intervalHours, k),
  }
}

/**
 * How long a dose stays relevant: after this the remaining amount is below ~1% of the dose.
 * Uses the slower of absorption and elimination so flip-flop kinetics are covered.
 */
function relevanceHorizonHours(k: RateConstants): number {
  const slowest = Math.min(k.ka, k.ke)
  return Math.log(100) / slowest + tmaxFor(k.ka, k.ke)
}

/**
 * True while at least one dose is still within its relevance horizon at `now` (or lies in the
 * future), i.e. the curve has something left to show.
 */
export function anyDoseInEffect(
  doses: readonly DoseEvent[],
  params: PkParameters,
  now: number,
): boolean {
  const horizon = relevanceHorizonHours(rateConstants(params)) * MS_PER_HOUR
  return doses.some((d) => d.at + horizon >= now)
}

/**
 * Hours of history a chart shows: three days for short-acting peptides (half-life under a day),
 * whose daily doses would otherwise draw as a comb of unreadable spikes; undefined (every dose
 * still in effect) for long-acting ones. The in-app chart and the report both follow it.
 */
export function lookbackHoursFor(params: PkParameters): number | undefined {
  return params.halfLifeHours < 24 ? 72 : undefined
}

export interface SimulationWindow {
  start: number
  end: number
}

/**
 * Sample the curve adaptively. A uniform grid misses short-lived peaks (tesamorelin peaks
 * about nine minutes after injection), so every dose gets dense samples around its own rise
 * and peak, merged with a coarse grid across the whole window. `doseSamples` and `localHours` set
 * how many of those dense samples each dose gets and how far they reach: a long schedule spreads
 * fewer over one interval, which keeps its cost flat however many doses it holds.
 */
export function simulate(
  doses: readonly DoseEvent[],
  params: PkParameters,
  window: SimulationWindow,
  baseSamples = 240,
  doseSamples = 60,
  localHours?: number,
): PkPoint[] {
  const k = rateConstants(params)
  const span = window.end - window.start
  if (!(span > 0)) return []
  const times = new Set<number>()
  for (let i = 0; i <= baseSamples; i++) {
    times.add(Math.round(window.start + (span * i) / baseSamples))
  }
  const peakMs = tmaxFor(k.ka, k.ke) * MS_PER_HOUR
  const localMs = Math.min((localHours ?? relevanceHorizonHours(k)) * MS_PER_HOUR, span)
  for (const dose of doses) {
    // Just before the dose so the line jumps from the prior level, then log-spaced afterwards.
    addIfInside(times, dose.at - 1, window)
    addIfInside(times, dose.at, window)
    addIfInside(times, dose.at + peakMs, window)
    for (let i = 1; i <= doseSamples; i++) {
      const offset = (localMs * (Math.exp((i / doseSamples) * Math.log(1001)) - 1)) / 1000
      addIfInside(times, dose.at + offset, window)
    }
  }
  return [...times].sort((a, b) => a - b).map((at) => ({ at, amount: amountAt(at, doses, k) }))
}

function addIfInside(times: Set<number>, at: number, window: SimulationWindow): void {
  if (at >= window.start && at <= window.end) times.add(Math.round(at))
}

/**
 * Pick a chart window: back far enough to include the doses that still matter and forward far
 * enough to show the decay with no further doses (five half-lives, or longer when absorption is
 * the slow step). `lookbackHours` caps history for frequently dosed peptides.
 */
export function chartWindow(
  doses: readonly DoseEvent[],
  params: PkParameters,
  now: number,
  lookbackHours?: number,
): SimulationWindow {
  const k = rateConstants(params)
  const horizon = relevanceHorizonHours(k) * MS_PER_HOUR
  const forward = Math.max(5 * params.halfLifeHours * MS_PER_HOUR, horizon * 0.6)
  const latest = doses.reduce((max, d) => Math.max(max, d.at), now)
  const end = Math.max(now, latest) + forward
  const relevant = doses.filter((d) => d.at + horizon >= now)
  const earliest = relevant.reduce((min, d) => Math.min(min, d.at), now)
  let start = Math.min(earliest, now) - Math.max(params.tmaxHours * MS_PER_HOUR * 0.25, 30 * 60_000)
  if (lookbackHours !== undefined) start = Math.max(start, now - lookbackHours * MS_PER_HOUR)
  return { start, end }
}

export interface LevelSummary {
  /** Estimated amount at `now`. */
  now: number
  /** Highest sampled point, or null when every sample is zero. */
  peak: PkPoint | null
  /** First sample after the peak below 10% of it, or null if the window ends first. */
  clearsAt: number | null
}

/** Headline readings for a simulated curve: the amount now, the peak, and when it falls away. */
export function summarizeLevels(
  points: readonly PkPoint[],
  doses: readonly DoseEvent[],
  params: PkParameters,
  now: number,
): LevelSummary {
  const peak = points.reduce<PkPoint | null>(
    (best, p) => (p.amount > (best?.amount ?? 0) ? p : best),
    null,
  )
  const clearsAt = peak
    ? (points.find((p) => p.at > peak.at && p.amount < peak.amount * 0.1)?.at ?? null)
    : null
  return { now: amountAt(now, doses, rateConstants(params)), peak, clearsAt }
}
