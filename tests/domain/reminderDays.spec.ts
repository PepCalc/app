import { describe, expect, it } from 'vitest'
import { reminderPlanFor } from '@/domain/reminderDays'
import type { LocalCalendar, Weekday } from '@/domain/schedule'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H

// Fake UTC calendar: 1970-01-01 was Thursday (ISO weekday 4).
const utcCal: LocalCalendar = {
  atLocalTime(epochMs, dayOffset, hour, minute) {
    return Math.floor(epochMs / DAY) * DAY + dayOffset * DAY + hour * H + minute * MIN
  },
  weekdayOf(epochMs) {
    const dayIndex = Math.floor(epochMs / DAY)
    const dow = ((dayIndex + 3) % 7) + 1
    return dow as Weekday
  },
  daysSince(from, epochMs) {
    const [y, m, d] = from.split('-').map(Number)
    const fromDay = Math.floor(Date.UTC(y!, m! - 1, d!) / DAY)
    const targetDay = Math.floor(epochMs / DAY)
    return targetDay - fromDay
  },
}

// 2026-11-16 is a Monday.
const MON = Date.UTC(2026, 10, 16)

describe('reminderPlanFor', () => {
  it('plans times across the 7-day horizon for daily, weekly and cycle schedules', () => {
    const daily = reminderPlanFor({
      schedule: {
        kind: 'daily',
        times: [
          { hour: 8, minute: 0 },
          { hour: 20, minute: 0 },
        ],
      },
      dueAt: MON + 8 * H,
      now: MON,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(daily).toMatchObject({ mode: 'times' })
    if (daily.mode === 'times') {
      expect(daily.times).toHaveLength(14)
      expect(daily.times[0]).toBe(MON + 8 * H)
      expect(daily.times.every((t) => t <= MON + 7 * DAY)).toBe(true)
    }

    const weekly = reminderPlanFor({
      schedule: { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 9, minute: 0 }] },
      dueAt: MON + 9 * H,
      now: MON,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(weekly).toEqual({
      mode: 'times',
      times: [MON + 9 * H, MON + 2 * DAY + 9 * H, MON + 4 * DAY + 9 * H],
    })
  })

  it('returns the next on-day times when a cycle is currently in its off days', () => {
    // Anchor 2026-11-16 (Mon): 2 on (Mon, Tue), 3 off (Wed, Thu, Fri), next on Sat + Sun.
    // At Wed (MON + 2d), dueAt is Sat (MON + 5d) at 08:00.
    const now = MON + 2 * DAY + 12 * H
    const sat = MON + 5 * DAY
    const plan = reminderPlanFor({
      schedule: {
        kind: 'cycle',
        onDays: 2,
        offDays: 3,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      },
      dueAt: sat + 8 * H,
      now,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(plan).toEqual({
      mode: 'times',
      times: [sat + 8 * H, sat + DAY + 8 * H],
    })
  })

  it('starts a daily schedule from now when dueAt is in the past and honours the 7-day horizon', () => {
    const now = MON + 3 * DAY + 10 * H
    const plan = reminderPlanFor({
      schedule: {
        kind: 'daily',
        times: [
          { hour: 8, minute: 0 },
          { hour: 20, minute: 0 },
        ],
      },
      dueAt: MON + 8 * H,
      now,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(plan.mode).toBe('times')
    if (plan.mode === 'times') {
      expect(plan.times[0]).toBe(MON + 3 * DAY + 20 * H)
      expect(plan.times.every((t) => t >= now && t <= now + 7 * DAY)).toBe(true)
    }
  })

  it('plans times from dueAt up to the horizon for intervals under 24 hours', () => {
    const dueAt = MON + 12 * H
    const plan = reminderPlanFor({
      schedule: { kind: 'interval', everyHours: 12 },
      dueAt,
      now: MON,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(plan.mode).toBe('times')
    if (plan.mode === 'times') {
      expect(plan.times[0]).toBe(dueAt)
      expect(plan.times).toHaveLength(14)
      expect(plan.times[13]).toBe(MON + 7 * DAY)
    }
  })

  it('plans repeating days for a 24-hour interval', () => {
    const plan = reminderPlanFor({
      schedule: { kind: 'interval', everyHours: 24 },
      dueAt: MON + 8 * H,
      now: MON,
      horizonDays: 7,
      cal: utcCal,
    })
    expect(plan.mode).toBe('days')
    if (plan.mode === 'days') {
      expect(plan.repeating).toBe(true)
      expect(plan.days).toHaveLength(8)
      expect(plan.days[0]).toBe(MON + 8 * H)
    }
  })

  it('plans one non-repeating day for intervals over 24 hours', () => {
    expect(
      reminderPlanFor({
        schedule: { kind: 'interval', everyHours: 168 },
        dueAt: MON + 3 * DAY,
        now: MON,
        horizonDays: 7,
        cal: utcCal,
      }),
    ).toEqual({ mode: 'days', days: [MON + 3 * DAY], repeating: false })
  })

  it('returns none for asNeeded or an interval with no dueAt', () => {
    expect(
      reminderPlanFor({
        schedule: { kind: 'asNeeded' },
        dueAt: null,
        now: MON,
        horizonDays: 7,
        cal: utcCal,
      }),
    ).toEqual({ mode: 'none' })
    expect(
      reminderPlanFor({
        schedule: { kind: 'interval', everyHours: 12 },
        dueAt: null,
        now: MON,
        horizonDays: 7,
        cal: utcCal,
      }),
    ).toEqual({ mode: 'none' })
  })
})
