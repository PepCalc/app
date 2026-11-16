import { roundTo } from './units'

/**
 * Units for body measures, kept apart from dose units (`units.ts`), which never convert to
 * these. Weight is stored in kilograms and height in centimetres, unrounded, so switching the
 * display unit never loses precision; conversion happens only for display and entry.
 */
export type WeightUnit = 'kg' | 'lb'
export type HeightUnit = 'cm' | 'ftin'

export const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lb']
export const HEIGHT_UNITS: readonly HeightUnit[] = ['cm', 'ftin']

/** Exact by definition (International Yard and Pound Agreement, 1959). */
const KG_PER_LB = 0.45359237
const CM_PER_INCH = 2.54
const INCHES_PER_FOOT = 12

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}

export interface FeetInches {
  feet: number
  inches: number
}

export function feetInchesToCm({ feet, inches }: FeetInches): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH
}

/** Whole feet and inches rounded to one decimal; 71.96 in reads as 6 ft 0 in, never 5 ft 12 in. */
export function cmToFeetInches(cm: number): FeetInches {
  const totalInches = roundTo(cm / CM_PER_INCH, 1)
  const feet = Math.floor(totalInches / INCHES_PER_FOOT)
  return { feet, inches: roundTo(totalInches - feet * INCHES_PER_FOOT, 1) }
}

/** "82.4 kg" or "181.7 lb": one decimal, the precision of a home scale. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${roundTo(fromKg(kg, unit), 1)} ${unit}`
}

/**
 * A signed change, "-3.2 kg" or "+0.4 lb", so a gain is never mistaken for a loss. The size is
 * rounded before the sign is applied, so a loss and an equal gain round alike.
 */
export function formatWeightChange(deltaKg: number, unit: WeightUnit): string {
  return signed(fromKg(deltaKg, unit), (size) => `${size} ${unit}`, `0 ${unit}`)
}

function signed(value: number, format: (size: number) => string, zero: string): string {
  const size = roundTo(Math.abs(value), 1)
  if (size === 0) return zero
  return `${value > 0 ? '+' : '−'}${format(size)}`
}

/** A signed percentage, "-12.4%". */
export function formatPercentChange(percent: number): string {
  return signed(percent, (size) => `${size}%`, '0%')
}

export function formatHeight(cm: number, unit: HeightUnit): string {
  if (unit === 'cm') return `${roundTo(cm, 1)} cm`
  const { feet, inches } = cmToFeetInches(cm)
  return `${feet} ft ${inches} in`
}

/** Short display label for the active weight and height units, e.g. "kg, cm" or "lb, ft in". */
export function unitsSummary(weightUnit: WeightUnit, heightUnit: HeightUnit): string {
  return `${weightUnit}, ${heightUnit === 'ftin' ? 'ft in' : 'cm'}`
}
