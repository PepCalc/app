/**
 * Dose bands and callouts placed on a body-measure line (weight or BMI). Each strength of a
 * medicine gets a colour slot and colours the stretch of the line from that dose until the
 * next change of medicine or strength. Because neither app stores a stop date, the latest dose
 * stays in effect until another dose is logged.
 */
import { valueAt } from './photos'

const DAY_MS = 86_400_000

/** A logged dose as the chart needs it. `key` pools doses of one medicine. */
export interface BandDose {
  key: string
  label: string
  /** Epoch milliseconds. */
  at: number
  amount: number
  /** "mg", "mcg", "IU": written after the amount. */
  unitLabel: string
}

/** A stretch of time during which one strength of one medicine was the latest dose. */
export interface DoseBand {
  key: string
  label: string
  amount: number
  unitLabel: string
  /** Colour slot, shared by every band of the same medicine and strength. */
  slot: number
  /** Epoch milliseconds, start inclusive, end exclusive. */
  start: number
  end: number
}

/** A dose placed on the line. */
export interface DoseShot extends BandDose {
  /** The line's height at `at`. */
  value: number
  slot: number
  /** Starts a band: the first shot in view, or a different medicine or strength from the last. */
  changed: boolean
  /** The first shot of its medicine in view; its label names the medicine. */
  first: boolean
}

export interface DoseLegendItem {
  slot: number
  key: string
  label: string
  amount: number
  unitLabel: string
}

export interface DoseBands {
  bands: DoseBand[]
  shots: DoseShot[]
  legend: DoseLegendItem[]
  /** More than one medicine appears, so labels and the legend name the medicine. */
  named: boolean
}

export const DOSE_SLOTS = 8
export const LABEL_ALL_MAX = 12

const strengthId = (key: string, amount: number) => `${key}\0${amount}`

/**
 * Computes colour bands, line-placed shots and legend entries for `doses` over `line` (oldest
 * first). Doses before the line still set the strength in effect at the first weigh-in; doses
 * outside `valueAt`'s measured span get no shot.
 */
export function doseBands(
  doses: readonly BandDose[],
  line: readonly { at: number; value: number }[],
): DoseBands {
  const firstPoint = line[0]
  const lastPoint = line[line.length - 1]
  if (!doses.length || !firstPoint || !lastPoint) {
    return { bands: [], shots: [], legend: [], named: false }
  }

  const lineStart = firstPoint.at
  const lineEnd = lastPoint.at
  const sorted = [...doses].sort((a, b) => a.at - b.at)

  interface RawBand {
    key: string
    label: string
    amount: number
    unitLabel: string
    start: number
    end: number
    clippedStart: number
    clippedEnd: number
    inView: boolean
  }

  const rawBands: RawBand[] = []
  const doseBandIndex: number[] = []

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]!
    const prev = rawBands[rawBands.length - 1]
    if (!prev || prev.key !== d.key || prev.amount !== d.amount) {
      if (prev) prev.end = d.at
      rawBands.push({
        key: d.key,
        label: d.label,
        amount: d.amount,
        unitLabel: d.unitLabel,
        start: d.at,
        end: Infinity,
        clippedStart: 0,
        clippedEnd: 0,
        inView: false,
      })
    }
    doseBandIndex.push(rawBands.length - 1)
  }

  for (const b of rawBands) {
    b.clippedStart = Math.max(b.start, lineStart)
    b.clippedEnd = Math.min(b.end, lineEnd)
    b.inView =
      b.clippedStart < b.clippedEnd ||
      (lineStart === lineEnd && b.start <= lineStart && b.end > lineStart)
  }

  const shotValues = sorted.map((d) => valueAt(line, d.at))

  // Assign slots in order of first appearance among doses that contribute a band or shot in view,
  // so every returning strength reuses its slot and nothing outside the span consumes one.
  const slots = new Map<string, number>()
  const legendMap = new Map<string, DoseLegendItem>()
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]!
    const band = rawBands[doseBandIndex[i]!]!
    if (!band.inView && shotValues[i] === null) continue
    const id = strengthId(d.key, d.amount)
    if (!slots.has(id)) {
      const slot = slots.size % DOSE_SLOTS
      slots.set(id, slot)
      legendMap.set(id, {
        slot,
        key: d.key,
        label: d.label,
        amount: d.amount,
        unitLabel: d.unitLabel,
      })
    }
  }

  const bands: DoseBand[] = rawBands
    .filter((b) => b.inView)
    .map((b) => ({
      key: b.key,
      label: b.label,
      amount: b.amount,
      unitLabel: b.unitLabel,
      slot: slots.get(strengthId(b.key, b.amount))!,
      start: b.clippedStart,
      end: b.clippedEnd,
    }))

  const shots: DoseShot[] = []
  const seenKeys = new Set<string>()
  for (let i = 0; i < sorted.length; i++) {
    const value = shotValues[i]!
    if (value === null) continue
    const d = sorted[i]!
    const isBandStart = i === 0 || doseBandIndex[i] !== doseBandIndex[i - 1]
    const first = !seenKeys.has(d.key)
    seenKeys.add(d.key)
    shots.push({
      ...d,
      value,
      slot: slots.get(strengthId(d.key, d.amount))!,
      changed: shots.length === 0 || isBandStart,
      first,
    })
  }

  const legend = [...legendMap.values()].sort((a, b) => a.slot - b.slot)
  const named = new Set(legend.map((l) => l.key)).size > 1
  return { bands, shots, legend, named }
}

/** Indexes into `shots` that carry a pill for the window in view. */
export function labelledShots(
  shots: readonly DoseShot[],
  window: { start: number; end: number },
  max = LABEL_ALL_MAX,
): ReadonlySet<number> {
  const inWindow: number[] = []
  for (let i = 0; i < shots.length; i++) {
    const at = shots[i]!.at
    if (at >= window.start && at <= window.end) inWindow.push(i)
  }
  if (inWindow.length <= max) return new Set(inWindow)
  return new Set(inWindow.filter((i) => shots[i]!.changed))
}

/** Shots within `toleranceMs` of `at`, for a readout at one moment. */
export function shotsNear(shots: readonly DoseShot[], at: number, toleranceMs: number): DoseShot[] {
  return shots.filter((s) => Math.abs(s.at - at) <= toleranceMs)
}

/** Whether two or more medicines were dosed over intersecting periods. */
export function dosePeriodsOverlap(doses: readonly BandDose[]): boolean {
  const spans = new Map<string, { min: number; max: number }>()
  for (const d of doses) {
    const span = spans.get(d.key)
    if (!span) spans.set(d.key, { min: d.at, max: d.at })
    else {
      if (d.at < span.min) span.min = d.at
      if (d.at > span.max) span.max = d.at
    }
  }
  const list = [...spans.values()]
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!
      const b = list[j]!
      if (Math.min(a.max, b.max) - Math.max(a.min, b.min) > DAY_MS) return true
    }
  }
  return false
}
