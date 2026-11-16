import { describe, expect, it } from 'vitest'
import {
  atLocalTime,
  daysBetween,
  daysSince,
  firstDayOfWeek,
  formatDate,
  formatDay,
  formatHours,
  formatTime,
  formatTimeOfDay,
  fromLocalInputValue,
  localCalendar,
  nowIso,
  toLocalInputValue,
  weekdayName,
  weekdayOf,
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

describe('atLocalTime', () => {
  it('lands on a local wall-clock time a whole number of days later', () => {
    const start = new Date(2026, 9, 20, 21, 30).getTime()
    const at = new Date(atLocalTime(start, 2, 9, 5))
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual(
      [2026, 9, 22, 9, 5],
    )
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

describe('calendar helpers', () => {
  it('returns ISO weekday 1..7 for local dates and handles Sunday as 7', () => {
    const mon = new Date(2026, 10, 16, 12, 0).getTime()
    const sun = new Date(2026, 10, 15, 12, 0).getTime()
    expect(weekdayOf(mon)).toBe(1)
    expect(weekdayOf(sun)).toBe(7)
    expect(localCalendar.weekdayOf(mon)).toBe(1)
  })

  it('counts local calendar days in daysSince', () => {
    const mon = new Date(2026, 10, 16, 0, 5).getTime()
    expect(daysSince('2026-11-16', mon)).toBe(0)
    expect(daysSince('2026-11-15', mon)).toBe(1)
    expect(daysSince('2026-11-17', mon)).toBe(-1)
    expect(localCalendar.daysSince('2026-11-10', mon)).toBe(6)
  })

  it('reads firstDayOfWeek from locale week info and falls back to Monday', () => {
    expect(firstDayOfWeek('en-US')).toBe(7)
    expect(firstDayOfWeek('de-DE')).toBe(1)
    expect(firstDayOfWeek('not a locale')).toBe(1)
  })

  it('formats TimeOfDay and weekday names', () => {
    expect(formatTimeOfDay({ hour: 8, minute: 5 })).toMatch(/8:05/)
    expect(weekdayName(1, 'long').length).toBeGreaterThan(2)
    expect(weekdayName(7, 'short').length).toBeGreaterThan(1)
  })
})
