import { describe, expect, it } from 'vitest'
import {
  formatA1c,
  formatA1cChange,
  formatGlucose,
  formatGlucoseChange,
  fromA1cPercent,
  fromMgDl,
  isValidA1c,
  isValidGlucose,
  toA1cPercent,
  toMgDl,
  summarizeGlucose,
  formatGlucoseRange,
} from '@/domain/glucose'

describe('glucose units', () => {
  it('converts mg/dL and mmol/L by the molar mass of glucose', () => {
    expect(toMgDl(5.5, 'mmol/L')).toBeCloseTo(99.09, 2)
    expect(fromMgDl(180.16, 'mmol/L')).toBeCloseTo(10, 6)
    expect(toMgDl(126, 'mg/dL')).toBe(126)
    expect(fromMgDl(toMgDl(7.2, 'mmol/L'), 'mmol/L')).toBeCloseTo(7.2, 12)
  })

  it('converts HbA1c with the NGSP master equation, both ways', () => {
    expect(toA1cPercent(48, 'mmol/mol')).toBeCloseTo(6.543, 3)
    expect(fromA1cPercent(6.5, 'mmol/mol')).toBeCloseTo(47.5, 1)
    expect(toA1cPercent(fromA1cPercent(8.1, 'mmol/mol'), 'mmol/mol')).toBeCloseTo(8.1, 12)
  })

  it('formats each unit at its lab precision, with signed changes', () => {
    expect(formatGlucose(99.09, 'mg/dL')).toBe('99 mg/dL')
    expect(formatGlucose(99.09, 'mmol/L')).toBe('5.5 mmol/L')
    expect(formatA1c(6.54, '%')).toBe('6.5%')
    expect(formatA1c(6.54, 'mmol/mol')).toBe('48 mmol/mol')
    expect(formatA1cChange(-1.6, '%')).toBe('−1.6 points')
    expect(formatA1cChange(-1.6, 'mmol/mol')).toBe('−17 mmol/mol')
    expect(formatGlucoseChange(4, 'mg/dL')).toBe('+4 mg/dL')
    expect(formatGlucoseChange(0, 'mmol/L')).toBe('0 mmol/L')
  })

  it('rejects readings no meter or lab reports', () => {
    expect(isValidA1c(2.9)).toBe(false)
    expect(isValidA1c(6.5)).toBe(true)
    expect(isValidGlucose(15)).toBe(false)
    expect(isValidGlucose(600)).toBe(true)
  })
})

describe('summarizeGlucose', () => {
  it('gives the average, median, lowest, highest and count', () => {
    expect(summarizeGlucose([100, 80, 120, 90])).toEqual({
      mean: 97.5,
      median: 95,
      min: 80,
      max: 120,
      count: 4,
    })
    expect(summarizeGlucose([110, 70, 90])!.median).toBe(90)
    expect(summarizeGlucose([])).toBeNull()
  })

  it('shows a range in the chosen unit', () => {
    expect(formatGlucoseRange(70, 180, 'mg/dL')).toBe('70 to 180 mg/dL')
    expect(formatGlucoseRange(72, 180, 'mmol/L')).toBe('4 to 10 mmol/L')
  })
})
