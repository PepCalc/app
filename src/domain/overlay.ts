/**
 * Several peptides' estimated levels on one chart. Their amounts differ by orders of magnitude
 * and can be in different units (mg, mcg, IU), so a shared amount axis would flatten all but
 * one curve, and two axes would invite reading one against the other. Each curve is instead
 * scaled to its own peak in the window: the chart compares timing (when each rises and clears),
 * never amounts, and says so.
 */
import {
  amountAt,
  chartWindow,
  lookbackHoursFor,
  rateConstants,
  simulate,
  type DoseEvent,
  type PkParameters,
  type SimulationWindow,
} from './pk'

/**
 * At most four curves: four series colours pass the colour-vision checks against each other in
 * both themes; a fifth does not, and five overlapping lines stop being readable on a phone.
 */
export const OVERLAY_MAX = 4

/** History and future shown are each capped, so a weekly peptide does not squash a daily one. */
const MAX_SPAN_MS = 28 * 24 * 3_600_000

export interface OverlayInput {
  key: string
  label: string
  params: PkParameters
  /** Logged doses in `unitLabel`. */
  doses: DoseEvent[]
  unitLabel: string
}

interface OverlayPoint {
  at: number
  /** Share of this curve's own peak in the window, 0 to 100. */
  percent: number
  /** The estimated amount, in the curve's own unit. */
  amount: number
}

export interface OverlaySeries {
  key: string
  label: string
  unitLabel: string
  points: OverlayPoint[]
  /** The highest estimated amount in the window; 0 when every dose has cleared. */
  peakAmount: number
}

/**
 * One window for every curve: from the earliest any of them would start to the latest any would
 * end, each as its own chart would choose, capped four weeks either side of now.
 */
export function overlayWindow(inputs: readonly OverlayInput[], now: number): SimulationWindow {
  const windows = inputs.map((i) => chartWindow(i.doses, i.params, now, lookbackHoursFor(i.params)))
  const start = Math.min(now, ...windows.map((w) => w.start))
  const end = Math.max(now, ...windows.map((w) => w.end))
  return { start: Math.max(start, now - MAX_SPAN_MS), end: Math.min(end, now + MAX_SPAN_MS) }
}

/** Below this share of the largest dose, a curve's peak counts as cleared and draws flat. */
const CLEARED_FRACTION = 0.01

const percentOf = (amount: number, peak: number) => (peak > 0 ? (amount / peak) * 100 : 0)

/** Every curve sampled over the shared window and scaled to its own peak there. */
export function overlayModel(
  inputs: readonly OverlayInput[],
  now: number,
): { window: SimulationWindow; series: OverlaySeries[] } {
  const window = overlayWindow(inputs, now)
  const series = inputs.map((input) => {
    const raw = simulate(input.doses, input.params, window)
    const highest = raw.reduce((max, p) => Math.max(max, p.amount), 0)
    // A residue of long-cleared doses would otherwise scale up to a full-height curve.
    const largestDose = input.doses.reduce((max, d) => Math.max(max, d.amount), 0)
    const peakAmount = highest >= CLEARED_FRACTION * largestDose ? highest : 0
    return {
      key: input.key,
      label: input.label,
      unitLabel: input.unitLabel,
      points: raw.map((p) => ({ ...p, percent: percentOf(p.amount, peakAmount) })),
      peakAmount,
    }
  })
  return { window, series }
}

/** Evenly spaced readings of every curve, as percent of its peak, for the table view. */
export function overlayTable(
  inputs: readonly OverlayInput[],
  series: readonly OverlaySeries[],
  window: SimulationWindow,
  rows = 13,
): { at: number; percents: number[] }[] {
  const ks = inputs.map((i) => rateConstants(i.params))
  return Array.from({ length: rows }, (_, r) => {
    const at = window.start + ((window.end - window.start) * r) / (rows - 1)
    return {
      at,
      percents: inputs.map((input, i) =>
        percentOf(amountAt(at, input.doses, ks[i]!), series[i]?.peakAmount ?? 0),
      ),
    }
  })
}

/**
 * A colour slot (0 to max - 1) for each chosen key. Keys that already had a slot keep it, so
 * removing one curve never repaints the others; a newly chosen key takes the first free slot in
 * `order` (lowest first by default). Keys past `max` get none.
 */
export function assignSlots(
  chosen: readonly string[],
  previous: ReadonlyMap<string, number>,
  max = OVERLAY_MAX,
  order: readonly number[] = Array.from({ length: max }, (_, i) => i),
): Map<string, number> {
  const slots = new Map<string, number>()
  for (const key of chosen) {
    const slot = previous.get(key)
    if (slot !== undefined && slot < max) slots.set(key, slot)
  }
  const used = new Set(slots.values())
  for (const key of chosen) {
    if (slots.has(key)) continue
    const free = order.find((i) => i < max && !used.has(i))
    if (free === undefined) break
    slots.set(key, free)
    used.add(free)
  }
  return slots
}
