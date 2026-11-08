import type { SourceRef } from './catalog'
import { roundTo } from './units'

/**
 * Blood sugar: HbA1c and glucose readings. Stored canonically and unrounded (HbA1c in NGSP
 * percent, glucose in mg/dL, the units US labels print), with the unit the user typed; the
 * display unit is a setting, converted only for display and entry, as weight is.
 */
export type A1cUnit = '%' | 'mmol/mol'
export type GlucoseUnit = 'mg/dL' | 'mmol/L'

export const A1C_UNITS: readonly A1cUnit[] = ['%', 'mmol/mol']
export const GLUCOSE_UNITS: readonly GlucoseUnit[] = ['mg/dL', 'mmol/L']

/** Glucose's molar mass is 180.16 g/mol, so 1 mmol/L is 18.016 mg/dL. */
const MG_DL_PER_MMOL_L = 18.016

/**
 * The IFCC-NGSP master equation as NGSP publishes it: NGSP (%) = 0.09148 x IFCC (mmol/mol)
 * + 2.152. Both directions use these two constants, so a round trip is exact.
 */
const NGSP_PER_IFCC = 0.09148
const NGSP_OFFSET = 2.152

export const GLUCOSE_UNIT_SOURCES: SourceRef[] = [
  {
    kind: 'standard',
    citation: 'NGSP: HbA1c in NGSP percent and IFCC mmol/mol (the IFCC-NGSP master equation)',
    url: 'https://ngsp.org/ifccngsp.asp',
  },
  {
    kind: 'standard',
    citation: 'Glucose molar mass 180.16 g/mol: 1 mmol/L = 18.016 mg/dL (PubChem, glucose)',
    url: 'https://pubchem.ncbi.nlm.nih.gov/compound/D-Glucose',
  },
]

export function toMgDl(value: number, unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? value : value * MG_DL_PER_MMOL_L
}

export function fromMgDl(mgDl: number, unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? mgDl : mgDl / MG_DL_PER_MMOL_L
}

export function toA1cPercent(value: number, unit: A1cUnit): number {
  return unit === '%' ? value : value * NGSP_PER_IFCC + NGSP_OFFSET
}

export function fromA1cPercent(percent: number, unit: A1cUnit): number {
  return unit === '%' ? percent : (percent - NGSP_OFFSET) / NGSP_PER_IFCC
}

/** Display precision follows the lab convention for each unit. */
const GLUCOSE_DECIMALS: Record<GlucoseUnit, number> = { 'mg/dL': 0, 'mmol/L': 1 }
const A1C_DECIMALS: Record<A1cUnit, number> = { '%': 1, 'mmol/mol': 0 }

/** Decimals to show a value in `unit`, for entry fields and tables. */
export function decimalsFor(unit: GlucoseUnit | A1cUnit): number {
  return unit in GLUCOSE_DECIMALS
    ? GLUCOSE_DECIMALS[unit as GlucoseUnit]
    : A1C_DECIMALS[unit as A1cUnit]
}

export function formatGlucose(mgDl: number, unit: GlucoseUnit): string {
  return `${roundTo(fromMgDl(mgDl, unit), GLUCOSE_DECIMALS[unit])} ${unit}`
}

/** "6.4%" or "46 mmol/mol". */
export function formatA1c(percent: number, unit: A1cUnit): string {
  const value = roundTo(fromA1cPercent(percent, unit), A1C_DECIMALS[unit])
  return unit === '%' ? `${value}%` : `${value} ${unit}`
}

function signed(value: number, decimals: number, suffix: string): string {
  const size = roundTo(Math.abs(value), decimals)
  if (size === 0) return `0${suffix}`
  return `${value > 0 ? '+' : '−'}${size}${suffix}`
}

/** A signed change in mg/dL shown in `unit`: "-41 mg/dL". */
export function formatGlucoseChange(deltaMgDl: number, unit: GlucoseUnit): string {
  return signed(fromMgDl(deltaMgDl, unit), GLUCOSE_DECIMALS[unit], ` ${unit}`)
}

/**
 * A change in percentage points expressed in `unit`. The master equation is linear, so a
 * change scales by its slope alone: -1.6 points is -17 mmol/mol.
 */
function a1cChangeIn(deltaPercent: number, unit: A1cUnit): number {
  return unit === '%' ? deltaPercent : deltaPercent / NGSP_PER_IFCC
}

/** A signed HbA1c change shown in `unit`: "-1.6 points" or "-17 mmol/mol". */
export function formatA1cChange(deltaPercent: number, unit: A1cUnit): string {
  return unit === '%'
    ? signed(deltaPercent, 1, ' points')
    : signed(a1cChangeIn(deltaPercent, unit), 0, ' mmol/mol')
}

/** Readings outside these are typos, not results; both cover what a meter or lab reports. */
export const A1C_RANGE = { min: 3, max: 20 } as const
export const GLUCOSE_RANGE_MG_DL = { min: 20, max: 600 } as const

export function isValidA1c(percent: number): boolean {
  return Number.isFinite(percent) && percent >= A1C_RANGE.min && percent <= A1C_RANGE.max
}

export function isValidGlucose(mgDl: number): boolean {
  return Number.isFinite(mgDl) && mgDl >= GLUCOSE_RANGE_MG_DL.min && mgDl <= GLUCOSE_RANGE_MG_DL.max
}

/** One day of glucose monitor readings, in mg/dL. */
export interface GlucoseDay {
  mean: number
  median: number
  min: number
  max: number
  count: number
}

/** The summary of a day's readings in mg/dL; null without any. */
export function summarizeGlucose(values: readonly number[]): GlucoseDay | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return {
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
    median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    count: sorted.length,
  }
}

/** "70 to 180 mg/dL". */
export function formatGlucoseRange(minMgDl: number, maxMgDl: number, unit: GlucoseUnit): string {
  const d = GLUCOSE_DECIMALS[unit]
  return `${roundTo(fromMgDl(minMgDl, unit), d)} to ${roundTo(fromMgDl(maxMgDl, unit), d)} ${unit}`
}

/** When a glucose reading was taken. Fasting readings are comparable with each other; the rest are not. */
export const GLUCOSE_CONTEXTS = [
  'fasting',
  'before-meal',
  'after-meal',
  'bedtime',
  'other',
] as const
export type GlucoseContext = (typeof GLUCOSE_CONTEXTS)[number]

export const GLUCOSE_CONTEXT_LABELS: Record<GlucoseContext, string> = {
  fasting: 'Fasting',
  'before-meal': 'Before a meal',
  'after-meal': 'After a meal',
  bedtime: 'Bedtime',
  other: 'Other',
}
