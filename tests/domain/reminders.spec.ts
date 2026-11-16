import { describe, expect, it } from 'vitest'
import {
  capReminders,
  DEFAULT_REMINDER,
  groupByMinute,
  MAX_PENDING,
  planAtTimes,
  planReminders,
  REPEATING_AHEAD,
  reminderText,
  restoredReminders,
  sanitizeReminderSettings,
  suggestReminderTime,
  type AtLocalTime,
} from '@/domain/reminders'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H

// A UTC "local" day keeps the arithmetic obvious; the real one lives in services/time.ts.
const utcAt: AtLocalTime = (ms, offset, hour, minute) =>
  Math.floor(ms / DAY) * DAY + offset * DAY + hour * H + minute * MIN

const on = { ...DEFAULT_REMINDER, enabled: true }

describe('planReminders', () => {
  it('plans nothing when off or given no days', () => {
    const base = { subjectId: 'm', repeating: false, now: 0, atLocalTime: utcAt }
    expect(planReminders({ ...base, days: [7 * DAY], rule: DEFAULT_REMINDER })).toEqual([])
    expect(planReminders({ ...base, days: [], rule: on })).toEqual([])
  })

  it('reminds a non-repeating dose on its day, the day before if asked, and the day after', () => {
    const plan = planReminders({
      subjectId: 'm',
      days: [7 * DAY + 20 * H],
      repeating: false,
      rule: { ...on, dayBefore: true },
      now: 0,
      atLocalTime: utcAt,
    })
    expect(plan).toEqual([
      { subjectId: 'm', kind: 'day-before', at: 6 * DAY + 9 * H },
      { subjectId: 'm', kind: 'due', at: 7 * DAY + 9 * H },
      { subjectId: 'm', kind: 'late', at: 8 * DAY + 9 * H },
    ])
  })

  it('drops reminders already past', () => {
    const plan = planReminders({
      subjectId: 'm',
      days: [7 * DAY],
      repeating: false,
      rule: on,
      now: 7 * DAY + 12 * H,
      atLocalTime: utcAt,
    })
    expect(plan.map((r) => r.kind)).toEqual(['late'])
  })

  it('plans a week ahead for a repeating schedule', () => {
    const days = Array.from({ length: 8 }, (_, k) => (1 + k) * DAY + 8 * H)
    const plan = planReminders({
      subjectId: 'm',
      days,
      repeating: true,
      rule: { ...on, hour: 21, dayBefore: true },
      now: 0,
      atLocalTime: utcAt,
    })
    expect(plan).toHaveLength(7)
    expect(plan.every((r) => r.kind === 'due')).toBe(true)
    expect(plan[0]!.at).toBe(DAY + 21 * H)
    expect(plan[6]!.at).toBe(7 * DAY + 21 * H)
  })

  it('drops past days on a repeating schedule and still plans a week ahead', () => {
    const days = Array.from({ length: 8 }, (_, k) => (10 + k) * DAY)
    const plan = planReminders({
      subjectId: 'm',
      days,
      repeating: true,
      rule: on,
      now: 10 * DAY + 12 * H,
      atLocalTime: utcAt,
    })
    expect(plan).toHaveLength(7)
    expect(plan[0]!.at).toBe(11 * DAY + 9 * H)
  })

  it('plans reminders for multiple non-repeating days, soonest first', () => {
    const plan = planReminders({
      subjectId: 'm',
      days: [7 * DAY, 8 * DAY],
      repeating: false,
      rule: { ...on, dayBefore: true },
      now: 0,
      atLocalTime: utcAt,
    })
    expect(plan).toEqual([
      { subjectId: 'm', kind: 'day-before', at: 6 * DAY + 9 * H },
      { subjectId: 'm', kind: 'due', at: 7 * DAY + 9 * H },
      { subjectId: 'm', kind: 'day-before', at: 7 * DAY + 9 * H },
      { subjectId: 'm', kind: 'late', at: 8 * DAY + 9 * H },
      { subjectId: 'm', kind: 'due', at: 8 * DAY + 9 * H },
      { subjectId: 'm', kind: 'late', at: 9 * DAY + 9 * H },
    ])
  })

  it('caps repeating schedules at REPEATING_AHEAD reminders even when 30 days are given', () => {
    const days = Array.from({ length: 30 }, (_, k) => (1 + k) * DAY)
    const plan = planReminders({
      subjectId: 'm',
      days,
      repeating: true,
      rule: on,
      now: 0,
      atLocalTime: utcAt,
    })
    expect(plan).toHaveLength(REPEATING_AHEAD)
  })

  it('plans nothing when the rule is off, regardless of days or repeating', () => {
    const days = [7 * DAY, 14 * DAY]
    expect(
      planReminders({
        subjectId: 'm',
        days,
        repeating: false,
        rule: DEFAULT_REMINDER,
        now: 0,
        atLocalTime: utcAt,
      }),
    ).toEqual([])
    expect(
      planReminders({
        subjectId: 'm',
        days,
        repeating: true,
        rule: { ...DEFAULT_REMINDER, dayBefore: true },
        now: 0,
        atLocalTime: utcAt,
      }),
    ).toEqual([])
  })

  it('ignores dayBefore on a repeating schedule', () => {
    const plan = planReminders({
      subjectId: 'm',
      days: [7 * DAY],
      repeating: true,
      rule: { ...on, dayBefore: true },
      now: 0,
      atLocalTime: utcAt,
    })
    expect(plan).toEqual([{ subjectId: 'm', kind: 'due', at: 7 * DAY + 9 * H }])
  })
})

describe('planAtTimes', () => {
  it('plans due reminders at four future times when lead is 0', () => {
    const times = [10 * MIN, 20 * MIN, 30 * MIN, 40 * MIN]
    expect(
      planAtTimes({
        subjectId: 'p',
        times,
        rule: { enabled: true, leadMinutes: 0 },
        now: 0,
        max: 10,
      }),
    ).toEqual(times.map((at) => ({ subjectId: 'p', kind: 'due', at })))
  })

  it('shifts each reminder earlier by leadMinutes', () => {
    expect(
      planAtTimes({
        subjectId: 'p',
        times: [30 * MIN, 60 * MIN],
        rule: { enabled: true, leadMinutes: 10 },
        now: 0,
        max: 10,
      }),
    ).toEqual([
      { subjectId: 'p', kind: 'due', at: 20 * MIN },
      { subjectId: 'p', kind: 'due', at: 50 * MIN },
    ])
  })

  it('drops a time 5 minutes ahead when lead is 10 minutes', () => {
    expect(
      planAtTimes({
        subjectId: 'p',
        times: [5 * MIN, 30 * MIN],
        rule: { enabled: true, leadMinutes: 10 },
        now: 0,
        max: 10,
      }),
    ).toEqual([{ subjectId: 'p', kind: 'due', at: 20 * MIN }])
  })

  it('plans nothing when rule is off', () => {
    expect(
      planAtTimes({
        subjectId: 'p',
        times: [30 * MIN],
        rule: { enabled: false, leadMinutes: 0 },
        now: 0,
        max: 10,
      }),
    ).toEqual([])
  })

  it('keeps the soonest max reminders when given ten times', () => {
    const times = Array.from({ length: 10 }, (_, i) => (10 - i) * H)
    const planned = planAtTimes({
      subjectId: 'p',
      times,
      rule: { enabled: true, leadMinutes: 0 },
      now: 0,
      max: 3,
    })
    expect(planned).toHaveLength(3)
    expect(planned.map((r) => r.at)).toEqual([H, 2 * H, 3 * H])
  })
})

describe('groupByMinute and capReminders', () => {
  it('groups three subjects falling in the same minute into one notification', () => {
    const base = 8 * H
    expect(
      groupByMinute([
        { subjectId: 'a', kind: 'due', at: base + 10_000 },
        { subjectId: 'b', kind: 'due', at: base + 40_000 },
        { subjectId: 'c', kind: 'due', at: base + 59_000 },
      ]),
    ).toEqual([{ subjectIds: ['a', 'b', 'c'], kind: 'due', at: base + 10_000 }])
  })

  it('keeps reminders in different minutes separate', () => {
    expect(
      groupByMinute([
        { subjectId: 'a', kind: 'due', at: 8 * H },
        { subjectId: 'b', kind: 'due', at: 8 * H + 30_000 },
        { subjectId: 'c', kind: 'due', at: 8 * H + MIN },
      ]),
    ).toEqual([
      { subjectIds: ['a', 'b'], kind: 'due', at: 8 * H },
      { subjectIds: ['c'], kind: 'due', at: 8 * H + MIN },
    ])
  })

  it('keeps due and late reminders separate in the same minute', () => {
    expect(
      groupByMinute([
        { subjectId: 'a', kind: 'due', at: 8 * H },
        { subjectId: 'b', kind: 'late', at: 8 * H + 15_000 },
      ]),
    ).toEqual([
      { subjectIds: ['a'], kind: 'due', at: 8 * H },
      { subjectIds: ['b'], kind: 'late', at: 8 * H + 15_000 },
    ])
  })

  it('caps 100 unsorted reminders to the 60 soonest, sorted', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      subjectId: `s-${i}`,
      kind: 'due' as const,
      at: (100 - i) * MIN,
    }))
    const capped = capReminders(items, MAX_PENDING)
    expect(capped).toHaveLength(60)
    expect(capped[0]!.at).toBe(MIN)
    expect(capped[59]!.at).toBe(60 * MIN)
  })
})

describe('reminder settings', () => {
  it('keeps valid entries and drops the rest', () => {
    expect(
      sanitizeReminderSettings({
        showNames: true,
        subjects: {
          a: { enabled: true, hour: 8, minute: 30, dayBefore: true, leadMinutes: 15 },
          b: { enabled: true, hour: 25, minute: 0 },
          c: 'nope',
        },
      }),
    ).toEqual({
      showNames: true,
      subjects: { a: { enabled: true, hour: 8, minute: 30, dayBefore: true, leadMinutes: 15 } },
    })
    expect(sanitizeReminderSettings(null)).toEqual({ showNames: false, subjects: {} })
  })

  it('falls back to legacy medications key and fills leadMinutes with 0', () => {
    expect(
      sanitizeReminderSettings({
        showNames: true,
        medications: {
          a: { enabled: true, hour: 9, minute: 15, dayBefore: false },
        },
      }),
    ).toEqual({
      showNames: true,
      subjects: { a: { enabled: true, hour: 9, minute: 15, dayBefore: false, leadMinutes: 0 } },
    })
  })

  it('resets disallowed leadMinutes values to 0', () => {
    expect(
      sanitizeReminderSettings({
        showNames: false,
        subjects: {
          a: { enabled: true, hour: 8, minute: 0, dayBefore: false, leadMinutes: 7 },
        },
      }),
    ).toEqual({
      showNames: false,
      subjects: { a: { enabled: true, hour: 8, minute: 0, dayBefore: false, leadMinutes: 0 } },
    })
  })

  it('turns every subject off on backup restore while keeping choices', () => {
    expect(
      restoredReminders({
        showNames: true,
        subjects: {
          a: { enabled: true, hour: 8, minute: 30, dayBefore: true, leadMinutes: 10 },
          b: { enabled: false, hour: 20, minute: 0, dayBefore: false, leadMinutes: 0 },
        },
      }),
    ).toEqual({
      showNames: true,
      subjects: {
        a: { enabled: false, hour: 8, minute: 30, dayBefore: true, leadMinutes: 10 },
        b: { enabled: false, hour: 20, minute: 0, dayBefore: false, leadMinutes: 0 },
      },
    })
  })
})

describe('reminderText', () => {
  it('keeps day-based wording for one subject and names it only when asked', () => {
    expect(reminderText('due', null).body).toBe('Your dose is due today. Tap to log it.')
    expect(reminderText('day-before', 'Wegovy').body).toBe('Your Wegovy dose is due tomorrow.')
  })

  it('formats precise due wording for one and three subjects with names off and on', () => {
    expect(reminderText('due', null, { precise: true })).toEqual({
      title: 'Dose due',
      body: 'Your dose is due. Tap to log it.',
    })
    expect(reminderText('due', 'BPC-157', { precise: true })).toEqual({
      title: 'Dose due',
      body: 'Your BPC-157 dose is due. Tap to log it.',
    })
    expect(reminderText('due', null, { count: 3 })).toEqual({
      title: '3 doses due',
      body: 'Tap to log them.',
    })
    expect(reminderText('due', ['BPC-157', 'TB-500', 'GHK-Cu'])).toEqual({
      title: '3 doses due',
      body: 'BPC-157, TB-500 and GHK-Cu. Tap to log them.',
    })
  })
})

describe('suggestReminderTime', () => {
  it('rounds the last dose time to the nearest quarter hour', () => {
    expect(suggestReminderTime(20, 10)).toEqual({ hour: 20, minute: 15 })
    expect(suggestReminderTime(8, 53)).toEqual({ hour: 9, minute: 0 })
    expect(suggestReminderTime(23, 58)).toEqual({ hour: 23, minute: 45 })
  })
})
