/**
 * Amount units. Mass units (mg, mcg) convert to each other; IU is a biological-activity unit
 * with a per-substance mass equivalence, so it never converts to or from mass here.
 */
export type MassUnit = 'mg' | 'mcg'
export type AmountUnit = MassUnit | 'iu'

export interface Quantity {
  value: number
  unit: AmountUnit
}

export const AMOUNT_UNITS: readonly AmountUnit[] = ['mg', 'mcg', 'iu']

const MCG_PER_UNIT: Record<MassUnit, number> = { mg: 1000, mcg: 1 }

export class IncompatibleUnitsError extends Error {
  constructor(from: AmountUnit, to: AmountUnit) {
    super(
      `Cannot convert ${unitLabel(from)} to ${unitLabel(to)}: IU and mass are not interchangeable.`,
    )
    this.name = 'IncompatibleUnitsError'
  }
}

function isMassUnit(unit: AmountUnit): unit is MassUnit {
  return unit === 'mg' || unit === 'mcg'
}

/** True when a quantity in `a` can be expressed in `b`. */
export function areCompatible(a: AmountUnit, b: AmountUnit): boolean {
  return a === b || (isMassUnit(a) && isMassUnit(b))
}

/** The units a dose may be entered in for a vial labelled in `vialUnit`. */
export function doseUnitsFor(vialUnit: AmountUnit): AmountUnit[] {
  return isMassUnit(vialUnit) ? ['mg', 'mcg'] : ['iu']
}

/** Convert a quantity to another unit; throws IncompatibleUnitsError across IU and mass. */
export function convert(quantity: Quantity, to: AmountUnit): Quantity {
  if (quantity.unit === to) return { value: quantity.value, unit: to }
  if (!isMassUnit(quantity.unit) || !isMassUnit(to)) {
    throw new IncompatibleUnitsError(quantity.unit, to)
  }
  return { value: (quantity.value * MCG_PER_UNIT[quantity.unit]) / MCG_PER_UNIT[to], unit: to }
}

export function unitLabel(unit: AmountUnit): string {
  return unit === 'iu' ? 'IU' : unit
}

/**
 * Round for display without float noise (0.30000000000000004 -> 0.3). Keeps up to
 * `maxDecimals` places and drops trailing zeros.
 */
export function roundTo(value: number, maxDecimals: number): number {
  const factor = 10 ** maxDecimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * Decimal places for showing an amount: two for mg, one for mcg, two for IU. IU doses go as
 * low as a quarter unit (0.25 IU of somatropin), so fewer places would lose real values.
 */
export const AMOUNT_DECIMALS: Record<AmountUnit, number> = { mg: 2, mcg: 1, iu: 2 }

/** An amount for display, rounded for its unit: "1.23 mg", "176.4 mcg", "0.25 IU". */
export function formatQuantity(q: Quantity): string {
  return `${roundTo(q.value, AMOUNT_DECIMALS[q.unit])} ${unitLabel(q.unit)}`
}

/** "0.25 mg": three decimals below one unit, two above. */
export function formatAmount(value: number, unitLabel: string): string {
  return `${roundTo(value, value < 1 ? 3 : 2)} ${unitLabel}`
}
