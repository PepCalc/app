import { describe, expect, it } from 'vitest'
import { findSyringe } from '@/data'
import {
  adviseDiluent,
  gentleWaterMl,
  shortlist,
  syringeTopUp,
  type DiluentRequest,
} from '@/domain/diluent'
import { IncompatibleUnitsError, type Quantity } from '@/domain/units'

const mg = (value: number): Quantity => ({ value, unit: 'mg' })
const mcg = (value: number): Quantity => ({ value, unit: 'mcg' })

function request(overrides: Partial<DiluentRequest>): DiluentRequest {
  return {
    vial: mg(5),
    lowDose: mcg(250),
    highDose: mcg(250),
    syringe: findSyringe('u100-1ml'),
    vialCapacityMl: 3,
    caps: [],
    ...overrides,
  }
}

const GHK_CAP = { name: 'GHK-Cu', amountMg: 50, maxMgPerMl: 10 }

describe('adviseDiluent', () => {
  it('prefers a dose that lands exactly on a mark over more water', () => {
    // 3 mL gives 10.5 units, between the marks of a 1 mL syringe; 2 mL gives 7 exactly.
    const best = adviseDiluent(request({ lowDose: mcg(175), highDose: mcg(175) })).ranked[0]!
    expect(best.waterMl).toBe(2)
    expect(best.low.scaleValue).toBeCloseTo(7, 9)
    expect(best.marks).toBe('on')
  })

  it('uses the most water that works when the syringe has finer marks', () => {
    const best = adviseDiluent(
      request({ lowDose: mcg(175), highDose: mcg(175), syringe: findSyringe('u100-0.3ml-half') }),
    ).ranked[0]!
    expect(best.waterMl).toBe(3)
    expect(best.low.scaleValue).toBeCloseTo(10.5, 9)
  })

  it('keeps the largest dose of a titration range within one syringe', () => {
    const advice = adviseDiluent(request({ vial: mg(10), lowDose: mg(2.5), highDose: mg(7.5) }))
    expect(advice.ranked.map((o) => o.waterMl)).toEqual([1, 0.5])
    expect(advice.ranked[0]!.high.scaleValue).toBeCloseTo(75, 9)
    expect(advice.ranked[0]!.marks).toBe('on')
  })

  it('dilutes a stinging peptide as far as the vial allows when the cap needs more', () => {
    const advice = adviseDiluent(
      request({ vial: mg(50), lowDose: mg(1), highDose: mg(2), caps: [GHK_CAP] }),
    )
    expect(advice.gentleMinMl).toBe(5)
    const best = advice.ranked[0]!
    expect(best).toMatchObject({ waterMl: 3, gentle: false, fitsVial: true })
    expect(best.low.scaleValue).toBeCloseTo(6, 9)
    // Topping each draw up to 10 mg/mL in the syringe: 1 mg to 10 units, 2 mg to 20.
    expect(best.topUp?.low.scaleValue).toBeCloseTo(10, 9)
    expect(best.topUp?.high.scaleValue).toBeCloseTo(20, 9)
  })

  it('meets the comfort cap when the vial is large enough', () => {
    const advice = adviseDiluent(
      request({
        vial: mg(50),
        lowDose: mg(1),
        highDose: mg(2),
        caps: [GHK_CAP],
        vialCapacityMl: 10,
      }),
    )
    expect(advice.ranked[0]).toMatchObject({ waterMl: 10, gentle: true, marks: 'on' })
  })

  it('leaves comfort unrated for an IU vial with no cap', () => {
    const iu = (value: number): Quantity => ({ value, unit: 'iu' })
    const advice = adviseDiluent(request({ vial: iu(100), lowDose: iu(10), highDose: iu(10) }))
    expect(advice.gentleMinMl).toBeNull()
    expect(advice.ranked[0]).toMatchObject({ waterMl: 3, gentle: null })
  })

  it.each([
    ['too-large', { vial: mg(10), lowDose: mg(7.5), highDose: mg(7.5), syringe: 'u100-0.3ml' }],
    ['too-small', { vial: mg(10), lowDose: mcg(5), highDose: mcg(5), syringe: 'u100-1ml' }],
    ['range-too-wide', { vial: mg(10), lowDose: mcg(50), highDose: mg(10), syringe: 'u100-1ml' }],
    ['more-than-vial', { vial: mg(5), lowDose: mg(6), highDose: mg(6), syringe: 'u100-1ml' }],
  ] as const)('reports %s instead of an option', (problem, input) => {
    const advice = adviseDiluent(request({ ...input, syringe: findSyringe(input.syringe) }))
    expect(advice).toMatchObject({ problem, ranked: [] })
  })

  it('refuses an IU dose from a mass vial', () => {
    expect(() => adviseDiluent(request({ lowDose: { value: 5, unit: 'iu' } }))).toThrow(
      IncompatibleUnitsError,
    )
  })
})

describe('gentleWaterMl', () => {
  it('takes the ingredient that needs the most water', () => {
    expect(gentleWaterMl([GHK_CAP, { name: 'X', amountMg: 30, maxMgPerMl: 10 }])).toBe(5)
    expect(gentleWaterMl([])).toBeNull()
  })
})

describe('shortlist', () => {
  it('lists the best in-vial options in ascending water, plus the gentle volume', () => {
    const advice = adviseDiluent(
      request({ vial: mg(50), lowDose: mg(1), highDose: mg(2), caps: [GHK_CAP] }),
    )
    const list = shortlist(advice)
    expect(list.map((o) => o.waterMl)).toEqual([2, 2.5, 3, 5])
    expect(list).toContain(advice.ranked[0])
    expect(list.at(-1)).toMatchObject({ gentle: true, fitsVial: false })
  })
})

describe('syringeTopUp', () => {
  const u100 = findSyringe('u100-1ml')

  it('fills to the volume the dose would have at the gentle strength, up to a mark', () => {
    // 1 mg of GHK-Cu from 50 mg in 3 mL is 0.06 mL; at 10 mg/mL it is 0.1 mL.
    expect(syringeTopUp(0.06, 3, 5, u100)?.scaleValue).toBeCloseTo(10, 9)
    // 0.07 mL from 3 mL needs 0.1167 mL at 5 mL; the next mark is 12 units.
    expect(syringeTopUp(0.07, 3, 5, u100)?.scaleValue).toBeCloseTo(12, 9)
  })

  it('is not needed when the vial is already gentle, and not offered when it overflows', () => {
    expect(syringeTopUp(0.06, 5, 5, u100)).toBeNull()
    expect(syringeTopUp(0.06, 3, null, u100)).toBeNull()
    expect(syringeTopUp(0.2, 2, 5, findSyringe('u100-0.3ml'))).toBeNull()
  })
})
