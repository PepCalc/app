import { WEIGHT_UNITS, type HeightUnit, type WeightUnit } from './bodyUnits'

/** A circumference such as a waist: centimetres, or inches alone (nobody measures one in feet). */
export type LengthUnit = 'cm' | 'in'
const LENGTH_UNITS: readonly LengthUnit[] = ['cm', 'in']

const CM_PER_INCH = 2.54

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH
}

export function fromCm(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? cm : cm / CM_PER_INCH
}

/** The circumference unit that matches the height setting: feet and inches read lengths in inches. */
export function lengthUnitFor(height: HeightUnit): LengthUnit {
  return height === 'cm' ? 'cm' : 'in'
}

/**
 * Body measurements and what is derived from them. A measurement is one metric at one time,
 * stored in its dimension's canonical unit; a reading of several metrics at once (a smart scale)
 * is several measurements at the same time. Adding a metric is an entry in `METRICS`, never a
 * schema change. Body mass index is derived from weight and the profile's height and is never
 * stored. BMI is a population screening measure; the categories are the WHO adult cut-offs.
 * They fit because PepCalc is for adults only.
 */

/**
 * How a metric is measured, which decides its canonical unit (kg, cm, percent), the units it is
 * entered and shown in, and what counts as a valid value.
 */
export type Dimension = 'mass' | 'length' | 'percent'

/** Stored ids: renaming one orphans users' saved measurements, so add, never rename. */
export const METRIC_IDS = ['weight'] as const
export type BodyMetric = (typeof METRIC_IDS)[number]

export interface MetricSpec {
  label: string
  dimension: Dimension
}

export const METRICS: Record<BodyMetric, MetricSpec> = {
  weight: { label: 'Weight', dimension: 'mass' },
}

type PercentUnit = '%'
export type MeasureUnit = WeightUnit | LengthUnit | PercentUnit

/** Units a value of `dimension` may be entered in; the first is canonical. */
export function unitsFor(dimension: Dimension): readonly MeasureUnit[] {
  switch (dimension) {
    case 'mass':
      return WEIGHT_UNITS
    case 'length':
      return LENGTH_UNITS
    case 'percent':
      return ['%']
  }
}

/**
 * Whether a stored or entered value is one the app can compute with: positive and finite, in a
 * unit of the metric's dimension, and no more than 100 for a percentage.
 */
export function isValidMeasurement(metric: unknown, value: unknown, unit: unknown): boolean {
  if (!METRIC_IDS.includes(metric as never)) return false
  const { dimension } = METRICS[metric as BodyMetric]
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    (dimension !== 'percent' || value <= 100) &&
    unitsFor(dimension).includes(unit as never)
  )
}

/** Weight over height squared (kg/m²). */
export function bmi(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0))
    throw new RangeError('Weight and height must be positive.')
  const m = heightCm / 100
  return weightKg / (m * m)
}

type BmiCategory =
  'underweight' | 'healthy' | 'overweight' | 'obesity-1' | 'obesity-2' | 'obesity-3'

export interface BmiBand {
  category: BmiCategory
  label: string
  /** Inclusive lower bound, kg/m². */
  from: number
}

/** WHO adult BMI classification (Technical Report Series 894, 2000). */
export const BMI_BANDS: readonly BmiBand[] = [
  { category: 'underweight', label: 'Below the healthy range', from: 0 },
  { category: 'healthy', label: 'Healthy range', from: 18.5 },
  { category: 'overweight', label: 'Above the healthy range', from: 25 },
  { category: 'obesity-1', label: 'Obesity class 1', from: 30 },
  { category: 'obesity-2', label: 'Obesity class 2', from: 35 },
  { category: 'obesity-3', label: 'Obesity class 3', from: 40 },
]

export const BMI_SOURCE = {
  kind: 'standard',
  citation:
    'WHO Technical Report Series 894: Obesity, preventing and managing the global epidemic (2000)',
  url: 'https://iris.who.int/handle/10665/42330',
} as const

/** PepCalc is for adults only, which is what lets it use the WHO adult BMI bands for everyone. */
export const ADULT_AGE = 18

/** The WHO adult band for a BMI. */
export function bmiBand(value: number): BmiBand {
  let band = BMI_BANDS[0]!
  for (const b of BMI_BANDS) if (value >= b.from) band = b
  return band
}

export interface WeightPoint {
  /** Epoch milliseconds. */
  at: number
  kg: number
}

export interface WeightChange {
  first: WeightPoint
  latest: WeightPoint
  changeKg: number
  changePercent: number
}

/**
 * Change from the first weigh-in to the latest. PepCalc has no single start date (peptides
 * come and go), so the first weigh-in is the starting point. Null with no weigh-in.
 */
export function weightChange(weights: readonly WeightPoint[]): WeightChange | null {
  if (!weights.length) return null
  const sorted = [...weights].sort((a, b) => a.at - b.at)
  const first = sorted[0]!
  const latest = sorted[sorted.length - 1]!
  return {
    first,
    latest,
    changeKg: latest.kg - first.kg,
    changePercent: ((latest.kg - first.kg) / first.kg) * 100,
  }
}
