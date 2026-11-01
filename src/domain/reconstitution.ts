import { AMOUNT_DECIMALS, convert, roundTo, type AmountUnit, type Quantity } from './units'

/** Amount of peptide per mL of reconstituted solution, in the vial's unit. */
export interface Concentration {
  perMl: number
  unit: AmountUnit
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
  }
}

function requirePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidInputError(`${what} must be a positive number.`)
  }
}

/** Concentration after adding `diluentMl` of bacteriostatic water to a vial holding `vial`. */
export function concentrationOf(vial: Quantity, diluentMl: number): Concentration {
  requirePositive(vial.value, 'Vial amount')
  requirePositive(diluentMl, 'Water volume')
  return { perMl: vial.value / diluentMl, unit: vial.unit }
}

/** Volume (mL) to draw for `dose` from a solution at `concentration`. */
export function drawVolumeMl(dose: Quantity, concentration: Concentration): number {
  requirePositive(dose.value, 'Dose')
  requirePositive(concentration.perMl, 'Concentration')
  const doseInVialUnit = convert(dose, concentration.unit)
  return doseInVialUnit.value / concentration.perMl
}

export interface DrawPlan {
  concentration: Concentration
  volumeMl: number
  /** Whole doses the full vial holds at this dose, ignoring dead space. */
  dosesPerVial: number
}

export function planDraw(vial: Quantity, diluentMl: number, dose: Quantity): DrawPlan {
  const concentration = concentrationOf(vial, diluentMl)
  const volumeMl = drawVolumeMl(dose, concentration)
  const doseInVialUnit = convert(dose, vial.unit).value
  return {
    concentration,
    volumeMl,
    dosesPerVial: Math.floor(vial.value / doseInVialUnit + 1e-9),
  }
}

/**
 * "5 mg/mL (5000 mcg/mL)" for mass and "33.33 IU/mL" for IU, which never converts to mass;
 * rounded like amounts (see AMOUNT_DECIMALS).
 */
export function formatConcentration(c: Concentration): string {
  if (c.unit === 'iu') return `${roundTo(c.perMl, AMOUNT_DECIMALS.iu)} IU/mL`
  const mgPerMl = c.unit === 'mg' ? c.perMl : c.perMl / 1000
  return `${roundTo(mgPerMl, AMOUNT_DECIMALS.mg)} mg/mL (${roundTo(mgPerMl * 1000, AMOUNT_DECIMALS.mcg)} mcg/mL)`
}
