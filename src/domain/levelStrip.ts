/**
 * Estimated peptide levels drawn in a strip under a body measure (weight, BMI, HbA1c, glucose),
 * on the same time axis. They sit in their own panel rather than on a second axis of the same
 * plot, so neither scale can be lined up against the other to suggest a cause.
 *
 * One peptide beside a measure in real units reads in its own unit (mg, mcg or IU). Beside a
 * percent change, or with two or more peptides, each line reads as percent of its own peak in
 * the window: peptides are dosed in different units and amounts that differ by orders of
 * magnitude, and IU never converts to mass, so a shared amount axis would mislead.
 */
import { niceRange } from './report'
import { amountAt, rateConstants, simulate, type DoseEvent, type PkParameters } from './pk'

/** Below this share of the largest dose, a line's peak counts as cleared and draws flat. */
const CLEARED_FRACTION = 0.01

const DAY_MS = 86_400_000

export interface StripInput {
  key: string
  label: string
  params: PkParameters
  /** Every dose in `unitLabel`, oldest first; doses before the window still count toward it. */
  doses: DoseEvent[]
  unitLabel: string
}

export interface StripSeries {
  key: string
  label: string
  unitLabel: string
  /** `[at, percent of own peak, amount in unitLabel]`. */
  points: [number, number, number][]
  /** The highest estimated amount in the window; 0 when every dose has cleared. */
  peak: number
}

export interface StripReading {
  key: string
  label: string
  unitLabel: string
  percent: number
  amount: number
}

/** How the strip's axis reads: the estimated amount, or percent of each line's own peak. */
export type StripScale = 'amount' | 'percent'

/** The strip's scale for a measure shown in real units or as percent change. */
export function stripScale(measureInPercent: boolean, lineCount: number): StripScale {
  return measureInPercent || lineCount > 1 ? 'percent' : 'amount'
}

/**
 * The shared window: from the first entry to the later of the last entry and now. A lone entry
 * from today would give no width, so the window then reaches back a week.
 */
export function stripWindow(times: readonly number[], now: number): { start: number; end: number } {
  const start = Math.min(...times, now)
  const end = Math.max(...times, now)
  return end - start > 0 ? { start, end } : { start: end - 7 * DAY_MS, end }
}

const percentOf = (amount: number, peak: number) => (peak > 0 ? (amount / peak) * 100 : 0)

/** Every line sampled over the window and scaled to its own peak there. */
export function levelStrip(
  inputs: readonly StripInput[],
  window: { start: number; end: number },
): StripSeries[] {
  return inputs.map((input) => {
    const raw = simulate(input.doses, input.params, window)
    const highest = raw.reduce((max, p) => Math.max(max, p.amount), 0)
    const largestDose = input.doses.reduce((max, d) => Math.max(max, d.amount), 0)
    // A residue of long-cleared doses would otherwise scale up to a full-height line.
    const peak = highest >= CLEARED_FRACTION * largestDose ? highest : 0
    return {
      key: input.key,
      label: input.label,
      unitLabel: input.unitLabel,
      points: raw.map((p) => [p.at, percentOf(p.amount, peak), p.amount]),
      peak,
    }
  })
}

/** Each line's level at one moment, computed exactly rather than read off the samples. */
export function stripReadings(
  inputs: readonly StripInput[],
  series: readonly StripSeries[],
  at: number,
): StripReading[] {
  return inputs.map((input, i) => {
    const amount = amountAt(at, input.doses, rateConstants(input.params))
    return {
      key: input.key,
      label: input.label,
      unitLabel: input.unitLabel,
      percent: percentOf(amount, series[i]?.peak ?? 0),
      amount,
    }
  })
}

/**
 * Round ticks from zero up past the highest peak, about three steps, so the strip keeps the
 * same few gridlines as the percent axis (0, 50, 100). Only used for a single line.
 */
export function amountTicks(series: readonly StripSeries[]): number[] {
  const peak = series.reduce((max, s) => Math.max(max, s.peak), 0)
  return peak > 0 ? niceRange(0, peak, 3) : [0, 1]
}
