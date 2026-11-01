import { roundTo } from './units'

/**
 * Syringe geometry and how a volume reads on its barrel. Insulin syringes are graduated in
 * units (U-100: 100 units per mL; U-40: 40 units per mL); luer syringes in mL.
 */
export interface SyringeSpec {
  id: string
  label: string
  kind: 'insulin' | 'luer'
  /** Units per mL for insulin syringes; null for mL-graduated syringes. */
  unitsPerMl: number | null
  capacityMl: number
  /** Volume between adjacent tick marks. */
  tickMl: number
  /** Every n-th tick is a long, numbered mark. */
  labelEveryTicks: number
  description: string
}

export interface SyringeReading {
  syringe: SyringeSpec
  volumeMl: number
  /** The reading in the syringe's own scale: units for insulin syringes, mL for luer. */
  scaleValue: number
  scaleUnit: 'units' | 'mL'
  /** Nearest tick mark at or below capacity, in the syringe's scale. */
  nearestTickValue: number
  /** Relative error of drawing to the nearest tick instead of the exact volume. */
  tickRoundingError: number
  fits: boolean
  /** The volume is smaller than one tick, so it cannot be measured on this barrel. */
  belowResolution: boolean
  /** Number of full syringes needed when the volume exceeds capacity. */
  fillsNeeded: number
}

/** Tick rounding beyond this share of the dose is flagged in the UI. */
export const TICK_ERROR_WARNING = 0.05

function scaleUnit(syringe: SyringeSpec): 'units' | 'mL' {
  return syringe.unitsPerMl === null ? 'mL' : 'units'
}

export function toScale(volumeMl: number, syringe: SyringeSpec): number {
  return syringe.unitsPerMl === null ? volumeMl : volumeMl * syringe.unitsPerMl
}

export function readSyringe(volumeMl: number, syringe: SyringeSpec): SyringeReading {
  const tickScale = toScale(syringe.tickMl, syringe)
  const scaleValue = toScale(volumeMl, syringe)
  const capacityScale = toScale(syringe.capacityMl, syringe)
  const nearestTicks = Math.round(scaleValue / tickScale + 1e-9)
  const nearestTickValue = Math.min(nearestTicks * tickScale, capacityScale)
  const tickRoundingError =
    scaleValue > 0 ? Math.abs(nearestTickValue - scaleValue) / scaleValue : 0
  return {
    syringe,
    volumeMl,
    scaleValue,
    scaleUnit: scaleUnit(syringe),
    nearestTickValue: Number(nearestTickValue.toFixed(6)),
    tickRoundingError,
    fits: volumeMl <= syringe.capacityMl + 1e-9,
    belowResolution: volumeMl < syringe.tickMl - 1e-9,
    fillsNeeded: Math.max(1, Math.ceil(volumeMl / syringe.capacityMl - 1e-9)),
  }
}

/**
 * The smallest syringe that holds the volume; smaller barrels have finer graduations, so they
 * measure small draws more accurately. Among equal capacities the standard (coarser) marking
 * wins, since special half-unit syringes are less common.
 */
export function suggestSyringe(
  volumeMl: number,
  syringes: readonly SyringeSpec[],
): SyringeSpec | null {
  const fitting = syringes
    .filter((s) => volumeMl <= s.capacityMl + 1e-9 && volumeMl >= s.tickMl - 1e-9)
    .sort((a, b) => a.capacityMl - b.capacityMl || b.tickMl - a.tickMl)
  return fitting[0] ?? null
}

/** A reading in the syringe's scale, rounded as the barrel can be read: { 12.5, 'units' }. */
export function scaleParts(reading: SyringeReading): { value: number; unit: 'units' | 'mL' } {
  return reading.scaleUnit === 'units'
    ? { value: roundTo(reading.scaleValue, 2), unit: 'units' }
    : { value: roundTo(reading.scaleValue, 3), unit: 'mL' }
}

/** A reading as printed on the barrel: "12.5 units" on insulin syringes, "0.125 mL" on luer. */
export function scaleLabel(reading: SyringeReading): string {
  const { value, unit } = scaleParts(reading)
  return `${value} ${unit}`
}

export interface SyringeTick {
  /** Position along the graduated barrel, 0 at the needle end to 1 at capacity. */
  at: number
  kind: 'major' | 'half' | 'minor'
  /** The printed number on a major mark, in the syringe's scale; null elsewhere. */
  label: string | null
}

/**
 * Every graduation on the barrel, as printed: a long numbered mark every `labelEveryTicks`, a
 * medium mark halfway between them when that falls on a tick, short marks elsewhere.
 */
export function syringeTicks(syringe: SyringeSpec): SyringeTick[] {
  const count = Math.round(syringe.capacityMl / syringe.tickMl)
  const tickScale = toScale(syringe.tickMl, syringe)
  const every = syringe.labelEveryTicks
  return Array.from({ length: count + 1 }, (_, i) => {
    const major = i % every === 0
    const half = !major && every % 2 === 0 && i % (every / 2) === 0
    return {
      at: i / count,
      kind: major ? 'major' : half ? 'half' : 'minor',
      label: major ? String(roundTo(i * tickScale, 3)) : null,
    }
  })
}
