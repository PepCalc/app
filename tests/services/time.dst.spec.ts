import { describe, expect, it } from 'vitest'

process.env.TZ = 'America/New_York'
const { atLocalTime, daysSince, weekdayOf } = await import('@/services/time')

const HOUR_MS = 3_600_000

describe('daylight saving in America/New_York', () => {
  it('keeps 08:00 at 08:00 local across spring forward (23 hours)', () => {
    // Sat 2026-03-07 08:00 EST (UTC-5) -> Sun 2026-03-08 08:00 EDT (UTC-4)
    const sat = new Date(2026, 2, 7, 8, 0).getTime()
    const sun = atLocalTime(sat, 1, 8, 0)
    expect(new Date(sun).getHours()).toBe(8)
    expect(new Date(sun).getMinutes()).toBe(0)
    expect(sun - sat).toBe(23 * HOUR_MS)
  })

  it('keeps 08:00 at 08:00 local across fall back (25 hours)', () => {
    // Sat 2026-10-31 08:00 EDT (UTC-4) -> Sun 2026-11-01 08:00 EST (UTC-5)
    const sat = new Date(2026, 9, 31, 8, 0).getTime()
    const sun = atLocalTime(sat, 1, 8, 0)
    expect(new Date(sun).getHours()).toBe(8)
    expect(new Date(sun).getMinutes()).toBe(0)
    expect(sun - sat).toBe(25 * HOUR_MS)
  })

  it('computes ISO weekdayOf across local midnight', () => {
    const sundayNight = Date.parse('2026-11-16T04:59:59.000Z') // 23:59:59 EST on Sun Nov 15
    const mondayMidnight = Date.parse('2026-11-16T05:00:00.000Z') // 00:00:00 EST on Mon Nov 16
    expect(weekdayOf(sundayNight)).toBe(7)
    expect(weekdayOf(mondayMidnight)).toBe(1)
  })

  it('counts calendar days in daysSince across DST changes, not 24-hour blocks', () => {
    // 23 hours between Sat 08:00 EST and Sun 08:00 EDT is still 1 calendar day
    expect(daysSince('2026-03-07', new Date(2026, 2, 8, 8, 0).getTime())).toBe(1)
    // 25 hours between Sat 08:00 EDT and Sun 08:00 EST is still 1 calendar day
    expect(daysSince('2026-10-31', new Date(2026, 10, 1, 8, 0).getTime())).toBe(1)
    expect(daysSince('2026-10-31', new Date(2026, 10, 1, 23, 30).getTime())).toBe(1)
    expect(daysSince('2026-11-02', new Date(2026, 10, 1, 12, 0).getTime())).toBe(-1)
  })
})
