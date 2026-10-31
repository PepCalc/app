import { describe, expect, it } from 'vitest'
import { useCalculator } from '@/composables/useCalculator'

describe('useCalculator', () => {
  it('computes the semaglutide default draw', () => {
    const calc = useCalculator({ peptideId: 'semaglutide' })
    expect(calc.plan.value?.volumeMl).toBeCloseTo(0.15, 9)
    expect(calc.reading.value?.scaleValue).toBeCloseTo(15, 9)
  })

  it('converts the dose when the user switches mg to mcg', () => {
    const calc = useCalculator({ peptideId: 'semaglutide' })
    calc.actions.setDoseUnit('mcg')
    expect(calc.state.doseValue).toBe(250)
    expect(calc.plan.value?.volumeMl).toBeCloseTo(0.15, 9)
  })

  it('takes the new peptide defaults without converting them', () => {
    const calc = useCalculator({ peptideId: 'semaglutide' })
    calc.actions.selectPeptide('bpc-157')
    expect(calc.state.doseUnit).toBe('mcg')
    expect(calc.state.doseValue).toBe(250)
  })

  it('splits a KLOW dose into its components', () => {
    const calc = useCalculator({ peptideId: 'klow' })
    calc.state.doseValue = 8
    expect(calc.componentDoses.value.map((c) => c.dose.value)).toEqual([5000, 1000, 1000, 1000])
  })

  it('reports an IU/mass mismatch instead of computing', () => {
    const calc = useCalculator({
      peptideId: 'custom',
      vialAmount: 10,
      vialUnit: 'mg',
      diluentMl: 1,
    })
    calc.state.doseUnit = 'iu'
    calc.state.doseValue = 5
    expect(calc.plan.value).toBeNull()
    expect(calc.error.value).toMatch(/IU and mass/)
  })
})
