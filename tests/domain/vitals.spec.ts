import { describe, expect, it } from 'vitest'
import {
  formatBloodPressure,
  formatBloodPressureChange,
  formatHeartRate,
  formatHeartRateChange,
  isValidBloodPressure,
  isValidHeartRate,
} from '@/domain/vitals'

describe('vitals', () => {
  it('accepts plausible blood pressure with the top number above the bottom', () => {
    expect(isValidBloodPressure(120, 80)).toBe(true)
    expect(isValidBloodPressure(80, 120)).toBe(false)
    expect(isValidBloodPressure(90, 90)).toBe(false)
    expect(isValidBloodPressure(300, 80)).toBe(false)
    expect(isValidBloodPressure(120, 20)).toBe(false)
    expect(isValidBloodPressure(Number.NaN, 80)).toBe(false)
  })

  it('accepts a resting heart rate a monitor can report', () => {
    expect(isValidHeartRate(25)).toBe(true)
    expect(isValidHeartRate(220)).toBe(true)
    expect(isValidHeartRate(10)).toBe(false)
    expect(isValidHeartRate(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('shows whole numbers with units', () => {
    expect(formatBloodPressure(127.6, 81.2)).toBe('128/81 mmHg')
    expect(formatHeartRate(63.5)).toBe('64 bpm')
  })

  it('signs each change, with no sign on no change', () => {
    expect(formatBloodPressureChange(-6, 3)).toBe('−6/+3 mmHg')
    expect(formatBloodPressureChange(0.2, -0.4)).toBe('0/0 mmHg')
    expect(formatHeartRateChange(4)).toBe('+4 bpm')
    expect(formatHeartRateChange(-2.6)).toBe('−3 bpm')
  })
})
