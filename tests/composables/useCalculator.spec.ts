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

  it('does not warn about a draw that falls between marks', () => {
    const { warnings, reading } = useCalculator({
      peptideId: 'bpc-157',
      vialAmount: 5,
      diluentMl: 2,
      doseValue: 0.0312,
      doseUnit: 'mg',
    })
    expect(reading.value!.tickRoundingError).toBeGreaterThan(0.05)
    expect(warnings.value).toEqual([])
  })

  it('defaults to Tirzepatide with a valid draw and clear liquid', () => {
    const calc = useCalculator()
    expect(calc.state.peptideId).toBe('tirzepatide')
    expect(calc.reading.value?.scaleValue).toBeCloseTo(75, 9)
    expect(calc.solutionColor.value).toBe('clear')
  })

  it('identifies blue liquid for copper peptides and blends', () => {
    const calc = useCalculator({ peptideId: 'ghk-cu' })
    expect(calc.solutionColor.value).toBe('blue')
    calc.actions.selectPeptide('glow')
    expect(calc.solutionColor.value).toBe('blue')
    calc.actions.selectPeptide('ahk-cu')
    expect(calc.solutionColor.value).toBe('blue')
    calc.actions.selectPeptide('wolverine-blend')
    expect(calc.solutionColor.value).toBe('clear')
  })

  it('supports creating a custom single peptide and a custom blend', () => {
    const calc = useCalculator()
    calc.actions.selectCustom({ name: 'Epitalon', vialUnit: 'mg', vialAmount: 10 })
    expect(calc.state.peptideId).toBe('custom')
    expect(calc.state.customName).toBe('Epitalon')
    expect(calc.state.vialAmount).toBe(10)
    expect(calc.isBlend.value).toBe(false)

    calc.actions.selectCustomBlend({
      name: 'Copper Recovery',
      components: [
        { name: 'GHK-Cu', amountMg: 50, peptideId: 'ghk-cu' },
        { name: 'BPC-157', amountMg: 10, peptideId: 'bpc-157' },
      ],
    })
    expect(calc.isBlend.value).toBe(true)
    expect(calc.state.vialAmount).toBe(60)
    expect(calc.state.diluentMl).toBe(5)
    expect(calc.solutionColor.value).toBe('blue')
    calc.state.doseValue = 6
    expect(calc.componentDoses.value.map((c) => c.dose.value)).toEqual([5000, 1000])
  })

  it('offers another syringe only when its marks are finer', () => {
    const input = { vialAmount: 5, diluentMl: 2, doseValue: 0.25, doseUnit: 'mg' } as const
    const u100 = useCalculator({ ...input, syringeId: 'u100-1ml' })
    expect(u100.betterSyringe.value).toBeNull()
    const luer = useCalculator({ ...input, syringeId: 'luer-3ml' })
    expect(luer.betterSyringe.value?.id).toBe('luer-1ml')
  })
})
