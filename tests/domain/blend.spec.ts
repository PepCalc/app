import { describe, expect, it } from 'vitest'
import { blendDoseFromComponent, blendTotalMg, splitBlendDose } from '@/domain/blend'

const GLOW = [
  { name: 'GHK-Cu', amountMg: 50, peptideId: 'ghk-cu' },
  { name: 'BPC-157', amountMg: 10, peptideId: 'bpc-157' },
  { name: 'TB-500', amountMg: 10, peptideId: 'tb-500' },
] as const

describe('blend', () => {
  it('sums finite component amounts', () => {
    expect(blendTotalMg(GLOW)).toBe(70)
    expect(
      blendTotalMg([
        { name: 'A', amountMg: Number.NaN, peptideId: null },
        { name: 'B', amountMg: 5, peptideId: null },
      ]),
    ).toBe(5)
  })

  it('splits a total blend dose into each component share', () => {
    const shares = splitBlendDose({ value: 1.4, unit: 'mg' }, GLOW, 'mcg')
    expect(shares.map((s) => s.name)).toEqual(['GHK-Cu', 'BPC-157', 'TB-500'])
    expect(shares[0]!.dose.value).toBeCloseTo(1000, 9)
    expect(shares[1]!.dose.value).toBeCloseTo(200, 9)
    expect(shares[2]!.dose.value).toBeCloseTo(200, 9)
  })

  it('computes the total blend dose from a desired single-component dose', () => {
    const totalFromGhk = blendDoseFromComponent({ value: 1, unit: 'mg' }, 50, GLOW)
    expect(totalFromGhk?.unit).toBe('mg')
    expect(totalFromGhk?.value).toBeCloseTo(1.4, 9)

    const totalFromBpc = blendDoseFromComponent({ value: 250, unit: 'mcg' }, 10, GLOW)
    expect(totalFromBpc?.value).toBeCloseTo(1.75, 9)

    const roundTrip = splitBlendDose(totalFromBpc!, GLOW, 'mcg')
    expect(roundTrip[1]!.dose.value).toBeCloseTo(250, 9)
    expect(roundTrip[0]!.dose.value).toBeCloseTo(1250, 9)
  })

  it('returns null when component amount, dose, or blend total is not positive', () => {
    expect(blendDoseFromComponent({ value: 1, unit: 'mg' }, 0, GLOW)).toBeNull()
    expect(blendDoseFromComponent({ value: 0, unit: 'mg' }, 50, GLOW)).toBeNull()
    expect(blendDoseFromComponent({ value: 1, unit: 'mg' }, 10, [])).toBeNull()
  })
})
