import { areCompatible, convert, type Quantity } from './units'

/**
 * Total drawn per unit family. Mass doses are summed in the first mass unit seen (mcg and mg
 * convert); IU is summed on its own and never added to mass.
 */
export function totalsByUnit(doses: readonly Quantity[]): Quantity[] {
  const totals: Quantity[] = []
  for (const dose of doses) {
    const bucket = totals.find((t) => areCompatible(t.unit, dose.unit))
    if (bucket) bucket.value += convert(dose, bucket.unit).value
    else totals.push({ value: dose.value, unit: dose.unit })
  }
  return totals
}
