import { describe, expect, it } from 'vitest'
import {
  bmi,
  bmiBand,
  fromCm,
  isValidMeasurement,
  lengthUnitFor,
  METRIC_IDS,
  METRICS,
  toCm,
  unitsFor,
  weightChange,
} from '@/domain/body'

describe('bmi', () => {
  it('is weight over height squared', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3)
    expect(() => bmi(0, 170)).toThrow(RangeError)
  })

  it('uses the WHO adult bands at their inclusive lower edges', () => {
    expect(bmiBand(18.49).category).toBe('underweight')
    expect(bmiBand(18.5).category).toBe('healthy')
    expect(bmiBand(25).category).toBe('overweight')
    expect(bmiBand(30).category).toBe('obesity-1')
    expect(bmiBand(41).category).toBe('obesity-3')
  })
})

describe('measurements', () => {
  it('gives every metric a dimension whose canonical unit comes first', () => {
    for (const id of METRIC_IDS) expect(unitsFor(METRICS[id].dimension).length).toBeGreaterThan(0)
    expect(unitsFor('mass')[0]).toBe('kg')
    expect(unitsFor('length')[0]).toBe('cm')
    expect(unitsFor('percent')).toEqual(['%'])
  })

  it('accepts only positive values in a unit of the metric', () => {
    expect(isValidMeasurement('weight', 82.4, 'kg')).toBe(true)
    expect(isValidMeasurement('weight', 82.4, 'lb')).toBe(true)
    expect(isValidMeasurement('weight', 0, 'kg')).toBe(false)
    expect(isValidMeasurement('weight', Number.NaN, 'kg')).toBe(false)
    expect(isValidMeasurement('weight', 82.4, 'cm')).toBe(false)
    expect(isValidMeasurement('weight', '82', 'kg')).toBe(false)
    expect(isValidMeasurement('bodyFat', 20, '%')).toBe(false)
  })
})

describe('weightChange', () => {
  it('measures from the first weigh-in to the latest, in any order', () => {
    const change = weightChange([
      { at: 3, kg: 78 },
      { at: 1, kg: 80 },
      { at: 2, kg: 79 },
    ])
    expect(change).toMatchObject({ first: { at: 1 }, latest: { at: 3 }, changeKg: -2 })
    expect(change!.changePercent).toBeCloseTo(-2.5, 9)
    expect(weightChange([])).toBeNull()
  })
})

describe('length units', () => {
  it('converts circumferences in exact inches and follows the height setting', () => {
    expect(toCm(32, 'in')).toBeCloseTo(81.28, 9)
    expect(fromCm(toCm(33.5, 'in'), 'in')).toBeCloseTo(33.5, 9)
    expect(toCm(80, 'cm')).toBe(80)
    expect(lengthUnitFor('ftin')).toBe('in')
    expect(lengthUnitFor('cm')).toBe('cm')
  })
})
