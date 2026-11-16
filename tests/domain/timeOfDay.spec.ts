import { describe, expect, it } from 'vitest'
import { fromTimeValue, toTimeValue } from '@/domain/timeOfDay'

describe('timeOfDay', () => {
  it('round-trips time input values', () => {
    expect(toTimeValue({ hour: 9, minute: 5 })).toBe('09:05')
    expect(toTimeValue({ hour: 0, minute: 0 })).toBe('00:00')
    expect(fromTimeValue('21:45')).toEqual({ hour: 21, minute: 45 })
    expect(fromTimeValue('08:05:30')).toEqual({ hour: 8, minute: 5 })
    expect(fromTimeValue('')).toBeNull()
    expect(fromTimeValue('24:00')).toBeNull()
    expect(fromTimeValue('12:60')).toBeNull()
  })
})
