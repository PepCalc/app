import {
  concentrationOf,
  drawVolumeMl,
  InvalidInputError,
  type Concentration,
} from './reconstitution'
import { readSyringe, type SyringeReading, type SyringeSpec } from './syringe'
import { convert, type Quantity } from './units'

/*
 * Water is added with a separate mixing syringe, so candidates are half-mL steps a user can
 * measure. 10 mL is the largest sterile vial in common use for transferring a dilute mix.
 */
const WATER_STEP_ML = 0.5
const MAX_WATER_ML = 10
/** Readings within this share of a mark count as exactly on it (float noise, not user error). */
const ON_MARK_TOLERANCE = 0.005
/** Readings within this share of a mark count as near it; further off they fall between marks. */
const NEAR_MARK_ERROR = 0.05

/** An ingredient whose injections users report as tolerable only up to `maxMgPerMl`. */
export interface ComfortCap {
  name: string
  amountMg: number
  maxMgPerMl: number
}

export interface DiluentRequest {
  vial: Quantity
  /** Smallest and largest dose the user plans to draw (equal for a fixed dose). */
  lowDose: Quantity
  highDose: Quantity
  syringe: SyringeSpec
  /** What the glass vial holds; more water than this needs a larger sterile vial. */
  vialCapacityMl: number
  caps: readonly ComfortCap[]
}

export interface DiluentOption {
  waterMl: number
  concentration: Concentration
  low: SyringeReading
  high: SyringeReading
  fitsVial: boolean
  /** Every capped ingredient is at or below its cap; null when nothing is capped. */
  gentle: boolean | null
  /**
   * How the planned doses read on the barrel: `on` a mark exactly, `near` one (within
   * NEAR_MARK_ERROR), or `between` marks.
   */
  marks: MarkFit
  /**
   * When the vial is stronger than a comfort cap allows: what to fill the syringe to with water
   * after drawing each dose, so the injection itself is gentle. Null when not needed or when
   * the diluted dose would not fit the syringe.
   */
  topUp: { low: SyringeReading; high: SyringeReading } | null
}

export type MarkFit = 'on' | 'near' | 'between'

const MARK_RANK: Record<MarkFit, number> = { on: 0, near: 1, between: 2 }

function markFit(readings: readonly SyringeReading[]): MarkFit {
  const worst = Math.max(...readings.map((r) => r.tickRoundingError))
  if (worst <= ON_MARK_TOLERANCE) return 'on'
  return worst <= NEAR_MARK_ERROR ? 'near' : 'between'
}

/**
 * Why no option works: the largest dose never fits one syringe, the smallest is always below
 * one mark, no single volume satisfies both ends of the range, or the dose exceeds the vial.
 */
export type DiluentProblem = 'too-large' | 'too-small' | 'range-too-wide' | 'more-than-vial'

export interface DiluentAdvice {
  /** Workable options, best first; empty when `problem` is set. */
  ranked: DiluentOption[]
  /** Least water that keeps every capped ingredient at or below its cap; null without caps. */
  gentleMinMl: number | null
  problem: DiluentProblem | null
}

/** Least water (mL) that keeps every capped ingredient at or below its cap; null without caps. */
export function gentleWaterMl(caps: readonly ComfortCap[]): number | null {
  if (caps.length === 0) return null
  return Math.max(...caps.map((c) => c.amountMg / c.maxMgPerMl))
}

/**
 * The syringe reading to fill to with water after drawing `drawMl` from a vial mixed with
 * `waterMl`, so the injection is as dilute as `gentleMinMl` of water in the vial would make it.
 * Rounded up to a mark so it can be read; a little extra water only dilutes further. Null when
 * the vial is already that dilute or the total would not fit the syringe.
 */
export function syringeTopUp(
  drawMl: number,
  waterMl: number,
  gentleMinMl: number | null,
  syringe: SyringeSpec,
): SyringeReading | null {
  if (gentleMinMl === null || waterMl >= gentleMinMl - 1e-9) return null
  const ticks = Math.ceil((drawMl * gentleMinMl) / waterMl / syringe.tickMl - 1e-9)
  const total = readSyringe(ticks * syringe.tickMl, syringe)
  return total.fits ? total : null
}

function candidateVolumes(): number[] {
  const steps = Math.round(MAX_WATER_ML / WATER_STEP_ML)
  return Array.from({ length: steps }, (_, i) => (i + 1) * WATER_STEP_ML)
}

function optionFor(
  waterMl: number,
  req: DiluentRequest,
  gentleMinMl: number | null,
): DiluentOption {
  const concentration = concentrationOf(req.vial, waterMl)
  const low = readSyringe(drawVolumeMl(req.lowDose, concentration), req.syringe)
  const high = readSyringe(drawVolumeMl(req.highDose, concentration), req.syringe)
  const topUpOf = (r: SyringeReading) => syringeTopUp(r.volumeMl, waterMl, gentleMinMl, req.syringe)
  const [lowTopUp, highTopUp] = [topUpOf(low), topUpOf(high)]
  return {
    waterMl,
    concentration,
    low,
    high,
    fitsVial: waterMl <= req.vialCapacityMl + 1e-9,
    gentle: gentleMinMl === null ? null : waterMl >= gentleMinMl - 1e-9,
    marks: markFit([low, high]),
    topUp: lowTopUp && highTopUp ? { low: lowTopUp, high: highTopUp } : null,
  }
}

/*
 * Ranking, most important first: stay inside the vial; meet any comfort cap; while a cap is
 * still unmet, dilute as far as the vial allows; land doses on marks, exactly if possible; then
 * use the most water that works, because a weaker solution measures small doses more precisely.
 */
function compareOptions(a: DiluentOption, b: DiluentOption): number {
  const byFlag = (x: boolean, y: boolean) => Number(y) - Number(x)
  return (
    byFlag(a.fitsVial, b.fitsVial) ||
    byFlag(a.gentle !== false, b.gentle !== false) ||
    (a.gentle === false ? b.waterMl - a.waterMl : 0) ||
    MARK_RANK[a.marks] - MARK_RANK[b.marks] ||
    b.waterMl - a.waterMl
  )
}

/**
 * Ranks volumes of bacteriostatic water for a vial so that every planned dose fits one
 * syringe and is measurable on it. Comfort caps and the vial's capacity shape the ranking but
 * never hide an option: options over capacity are kept and flagged `fitsVial: false`.
 * Throws InvalidInputError for non-positive inputs and IncompatibleUnitsError across IU and mass.
 */
export function adviseDiluent(req: DiluentRequest): DiluentAdvice {
  if (!(req.vialCapacityMl > 0)) throw new InvalidInputError('Vial capacity must be positive.')
  const gentleMinMl = gentleWaterMl(req.caps)
  const fail = (problem: DiluentProblem): DiluentAdvice => ({ ranked: [], gentleMinMl, problem })

  const highInVialUnit = convert(req.highDose, req.vial.unit).value
  if (highInVialUnit > req.vial.value + 1e-9) return fail('more-than-vial')

  const all = candidateVolumes().map((ml) => optionFor(ml, req, gentleMinMl))
  const workable = all.filter((o) => o.high.fits && !o.low.belowResolution)
  if (workable.length === 0) {
    if (!all.some((o) => o.high.fits)) return fail('too-large')
    if (all.every((o) => o.low.belowResolution)) return fail('too-small')
    return fail('range-too-wide')
  }
  return { ranked: workable.sort(compareOptions), gentleMinMl, problem: null }
}

/**
 * A short, comparable list for display, in ascending water: the best options inside the vial,
 * plus the least water that meets the comfort cap when the vial cannot hold it.
 */
export function shortlist(advice: DiluentAdvice, size = 4): DiluentOption[] {
  const inVial = advice.ranked.filter((o) => o.fitsVial)
  const picked = (inVial.length ? inVial : advice.ranked).slice(0, size)
  const gentlest = advice.ranked
    .filter((o) => o.gentle && !o.fitsVial)
    .reduce<DiluentOption | null>((min, o) => (min && min.waterMl <= o.waterMl ? min : o), null)
  if (gentlest && !picked.includes(gentlest)) {
    picked.splice(Math.min(picked.length, size - 1), 1, gentlest)
  }
  return picked.sort((a, b) => a.waterMl - b.waterMl)
}
