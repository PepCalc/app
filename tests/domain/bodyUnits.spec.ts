import { describe, expect, it } from 'vitest'
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  formatPercentChange,
  formatWeeklyChange,
  formatWeight,
  formatWeightChange,
  fromKg,
  toKg,
  unitsSummary,
} from '@/domain/bodyUnits'

describe('weight units', () => {
  it('converts with the exact international pound', () => {
    expect(toKg(200, 'lb')).toBeCloseTo(90.718474, 9)
    expect(fromKg(toKg(187.4, 'lb'), 'lb')).toBeCloseTo(187.4, 9)
    expect(toKg(80, 'kg')).toBe(80)
  })

  it('formats one decimal and signs changes', () => {
    expect(formatWeight(90.718474, 'lb')).toBe('200 lb')
    expect(formatWeightChange(-3.25, 'kg')).toBe('−3.3 kg')
    expect(formatWeightChange(0.4, 'kg')).toBe('+0.4 kg')
    expect(formatWeightChange(0.01, 'kg')).toBe('0 kg')
    expect(formatPercentChange(-14.94)).toBe('−14.9%')
    expect(formatWeeklyChange(-0.6, 'kg')).toBe('−0.6 kg')
    expect(formatWeeklyChange(-1, 'lb')).toBe('−2.2 lb')
    expect(formatWeeklyChange(0, 'kg')).toBe('0 kg')
  })
})

describe('height units', () => {
  it('round-trips feet and inches', () => {
    expect(feetInchesToCm({ feet: 5, inches: 10 })).toBeCloseTo(177.8, 9)
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 })
  })

  it('never shows 12 inches', () => {
    expect(cmToFeetInches(182.85)).toEqual({ feet: 6, inches: 0 })
    expect(formatHeight(182.85, 'ftin')).toBe('6 ft 0 in')
    expect(formatHeight(170.04, 'cm')).toBe('170 cm')
  })

  it('formats the active weight and height unit pair', () => {
    expect(unitsSummary('kg', 'cm')).toBe('kg, cm')
    expect(unitsSummary('lb', 'ftin')).toBe('lb, ft in')
    expect(unitsSummary('kg', 'ftin')).toBe('kg, ft in')
  })
})
