import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { findPeptide, findSyringe } from '@/data'
import { useDiluentAdvisor, type MixContext } from '@/composables/useDiluentAdvisor'
import { useCalculator } from '@/composables/useCalculator'

function contextFor(peptideId: string, vialMg: number): MixContext {
  const peptide = findPeptide(peptideId)
  return reactive({
    peptide,
    components: peptide?.components?.map((c) => ({ ...c })) ?? [],
    vial: { value: vialMg, unit: 'mg' },
    syringe: findSyringe('u100-1ml'),
  })
}

describe('useDiluentAdvisor', () => {
  it('starts from the calculator dose and recommends a volume', () => {
    const advisor = useDiluentAdvisor(contextFor('bpc-157', 5))
    advisor.actions.reset({ value: 250, unit: 'mcg' })
    expect(advisor.selected.value?.waterMl).toBe(3)
    expect(advisor.options.value).toContain(advisor.best.value)
  })

  it('applies the GHK-Cu comfort cap inside a KLOW blend', () => {
    const advisor = useDiluentAdvisor(contextFor('klow', 80))
    advisor.actions.reset({ value: 2, unit: 'mg' })
    expect(advisor.concerns.value.map((c) => c.name)).toEqual(['GHK-Cu'])
    expect(advisor.advice.value?.gentleMinMl).toBe(5)
  })

  it('accepts a range typed high to low, and converts both ends between mg and mcg', () => {
    const advisor = useDiluentAdvisor(contextFor('bpc-157', 10))
    advisor.actions.reset({ value: 500, unit: 'mcg' })
    advisor.state.highDose = 250
    advisor.actions.setDoseUnit('mg')
    expect([advisor.state.lowDose, advisor.state.highDose]).toEqual([0.5, 0.25])
    const best = advisor.best.value!
    expect(best.low.volumeMl).toBeLessThan(best.high.volumeMl)
  })

  it('follows a tapped option until the advisor is reset', () => {
    const advisor = useDiluentAdvisor(contextFor('bpc-157', 5))
    advisor.actions.reset({ value: 250, unit: 'mcg' })
    const other = advisor.options.value.find((o) => o !== advisor.best.value)!
    advisor.actions.select(other.waterMl)
    expect(advisor.selected.value).toBe(other)
    advisor.actions.reset({ value: 250, unit: 'mcg' })
    expect(advisor.selected.value).toBe(advisor.best.value)
  })
})

describe('useCalculator comfort warning', () => {
  it('notes when GHK-Cu is mixed stronger than the reported comfort cap', () => {
    const calc = useCalculator({ peptideId: 'ghk-cu', diluentMl: 3 })
    const text = calc.warnings.value.map((w) => w.text).join(' ')
    expect(text).toMatch(/16\.7 mg\/mL/)
    expect(text).toMatch(/same syringe up to 10 units/)
    calc.state.diluentMl = 5
    expect(calc.warnings.value.some((w) => w.text.includes('mg/mL'))).toBe(false)
  })
})
