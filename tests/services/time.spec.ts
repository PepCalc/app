import { describe, expect, it } from 'vitest'
import {
  atLocalTime,
  daysBetween,
  formatDate,
  formatDay,
  formatHours,
  formatTime,
  fromLocalInputValue,
  nowIso,
  toLocalInputValue,
} from '@/services/time'

describe('time', () => {
  it('formats PK durations at a readable scale', () => {
    expect(formatHours(0.183)).toBe('11 min')
    expect(formatHours(24)).toBe('24 h')
    expect(formatHours(168)).toBe('7 days')
  })

  it('reads the injected clock as UTC ISO', () => {
    expect(nowIso(() => new Date('2026-10-25T12:00:00Z'))).toBe('2026-10-25T12:00:00.000Z')
  })

  it('round-trips datetime-local values', () => {
    const iso = '2026-10-25T12:34:00.000Z'
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso)
  })

  it('counts whole days', () => {
    expect(daysBetween('2026-10-20T12:00:00Z', new Date('2026-10-25T11:00:00Z'))).toBe(4)
  })
})

describe('formatDay and formatTime', () => {
  it('labels today, yesterday and earlier local days', () => {
    const now = new Date(2026, 10, 16, 14, 0).getTime()
    expect(formatDay(new Date(2026, 10, 16, 8, 10).getTime(), now)).toBe('Today')
    expect(formatDay(new Date(2026, 10, 15, 23, 50).getTime(), now)).toBe('Yesterday')
    const older = new Date(2026, 10, 10, 9, 0).getTime()
    expect(formatDay(older, now)).toBe(formatDate(atLocalTime(older, 0, 0, 0)))
  })

  it('formats a local time of day', () => {
    const text = formatTime(new Date(2026, 10, 16, 8, 5).getTime())
    expect(text).toMatch(/8:05/)
  })
})
