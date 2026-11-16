import { describe, expect, it } from 'vitest'
import {
  courseText,
  dueState,
  dueText,
  gapHours,
  isValidCourse,
  isValidSchedule,
  lastDrawFor,
  nextDue,
  protocolFollowingRename,
  remainingFraction,
  scheduleText,
  slots,
  type LocalCalendar,
  type Schedule,
  type Weekday,
} from '@/domain/schedule'
import { toTimeValue, type TimeOfDay } from '@/domain/timeOfDay'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H

// Fake calendar built on UTC so tests give identical results in every time zone.
const utcCal: LocalCalendar = {
  atLocalTime(epochMs, dayOffset, hour, minute) {
    const d = new Date(epochMs)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, hour, minute)
  },
  weekdayOf(epochMs) {
    const d = new Date(epochMs).getUTCDay()
    return (d === 0 ? 7 : d) as Weekday
  },
  daysSince(from, epochMs) {
    const [y, m, day] = from.split('-').map(Number)
    const d = new Date(epochMs)
    const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    return Math.round((target - Date.UTC(y!, m! - 1, day!)) / DAY)
  },
}

const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}
const fmtTime = (t: TimeOfDay) => toTimeValue(t)
const fmtWeekday = (d: Weekday) => WEEKDAY_SHORT[d]

// 2026-11-16 is a Monday.
const MON = Date.UTC(2026, 10, 16, 0, 0)
const t = (dayOffset: number, hour: number, minute = 0) =>
  MON + dayOffset * DAY + hour * H + minute * MIN

describe('slots', () => {
  it('1: daily 08:00, 20:00 over one day from 00:00 gives two slots', () => {
    const s: Schedule = {
      kind: 'daily',
      times: [
        { hour: 8, minute: 0 },
        { hour: 20, minute: 0 },
      ],
    }
    expect(slots(s, t(0, 0), t(1, 0), utcCal)).toEqual([t(0, 8), t(0, 20)])
  })

  it('2: daily 08:00 from 09:00 over two days excludes today and keeps tomorrow within the first day', () => {
    const s: Schedule = { kind: 'daily', times: [{ hour: 8, minute: 0 }] }
    expect(slots(s, t(0, 9), t(1, 9), utcCal)).toEqual([t(1, 8)])
    expect(slots(s, t(0, 9), t(2, 9), utcCal)).toEqual([t(1, 8), t(2, 8)])
  })

  it('3: weekly Mon, Wed, Fri 08:00 over a full week from Monday gives three slots', () => {
    const s: Schedule = { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] }
    expect(slots(s, t(0, 0), t(7, 0), utcCal)).toEqual([t(0, 8), t(2, 8), t(4, 8)])
  })

  it('4: weekly Sun 08:00 over a week gives one slot (Sunday is 7, not 0)', () => {
    const s: Schedule = { kind: 'weekly', days: [7], times: [{ hour: 8, minute: 0 }] }
    expect(slots(s, t(0, 0), t(7, 0), utcCal)).toEqual([t(6, 8)])
  })

  it('5: cycle 5 on 2 off anchored on Monday over two weeks gives ten slots, skipping days 5, 6, 12, 13', () => {
    const s: Schedule = {
      kind: 'cycle',
      onDays: 5,
      offDays: 2,
      times: [{ hour: 8, minute: 0 }],
      anchor: '2026-11-16',
    }
    expect(slots(s, t(0, 0), t(14, 0), utcCal)).toEqual([
      t(0, 8),
      t(1, 8),
      t(2, 8),
      t(3, 8),
      t(4, 8),
      t(7, 8),
      t(8, 8),
      t(9, 8),
      t(10, 8),
      t(11, 8),
    ])
  })

  it('6: cycle window before the anchor is empty', () => {
    const s: Schedule = {
      kind: 'cycle',
      onDays: 5,
      offDays: 2,
      times: [{ hour: 8, minute: 0 }],
      anchor: '2026-11-16',
    }
    expect(slots(s, t(-7, 0), t(0, 0), utcCal)).toEqual([])
  })

  it('7: interval and asNeeded return empty for any window', () => {
    expect(slots({ kind: 'interval', everyHours: 24 }, t(0, 0), t(7, 0), utcCal)).toEqual([])
    expect(slots({ kind: 'asNeeded' }, t(0, 0), t(7, 0), utcCal)).toEqual([])
  })

  it('8: to exactly on a slot excludes it; from on a slot includes it', () => {
    const s: Schedule = { kind: 'daily', times: [{ hour: 8, minute: 0 }] }
    expect(slots(s, t(0, 8), t(1, 8), utcCal)).toEqual([t(0, 8)])
  })
})

describe('nextDue', () => {
  const twiceDaily: Schedule = {
    kind: 'daily',
    times: [
      { hour: 8, minute: 0 },
      { hour: 20, minute: 0 },
    ],
  }

  it('handles the covered-slot table for 08:00 and 20:00 daily', () => {
    // 08:05 today -> 20:00 today
    expect(nextDue(twiceDaily, t(1, 8, 5), t(0, 0), t(1, 8, 5), utcCal)).toBe(t(1, 20))
    // 10:30 today (late) -> 20:00 today
    expect(nextDue(twiceDaily, t(1, 10, 30), t(0, 0), t(1, 10, 30), utcCal)).toBe(t(1, 20))
    // 19:10 today (early, within 6h of 20:00) -> 08:00 tomorrow
    expect(nextDue(twiceDaily, t(1, 19, 10), t(0, 0), t(1, 19, 10), utcCal)).toBe(t(2, 8))
    // 13:00 today (more than 6h before 20:00) -> 20:00 today
    expect(nextDue(twiceDaily, t(1, 13, 0), t(0, 0), t(1, 13, 0), utcCal)).toBe(t(1, 20))
    // yesterday 20:00 -> 08:00 today
    expect(nextDue(twiceDaily, t(0, 20, 0), t(0, 0), t(1, 6, 0), utcCal)).toBe(t(1, 8))
  })

  it('14: no draw on twice daily, created 10:00 -> 20:00 the same day', () => {
    expect(nextDue(twiceDaily, null, t(0, 10), t(0, 10), utcCal)).toBe(t(0, 20))
  })

  it('15: no draw on daily 08:00 only, created 10:00 -> 08:00 tomorrow', () => {
    const s: Schedule = { kind: 'daily', times: [{ hour: 8, minute: 0 }] }
    expect(nextDue(s, null, t(0, 10), t(0, 10), utcCal)).toBe(t(1, 8))
  })

  it('16: weekly Mon 08:00, last draw Monday 08:10 -> next Monday 08:00', () => {
    const s: Schedule = { kind: 'weekly', days: [1], times: [{ hour: 8, minute: 0 }] }
    expect(nextDue(s, t(0, 8, 10), t(0, 0), t(0, 9), utcCal)).toBe(t(7, 8))
  })

  it('17: weekly Mon 08:00, last draw Sunday 21:00 (11h early) -> following Monday 08:00', () => {
    const s: Schedule = { kind: 'weekly', days: [1], times: [{ hour: 8, minute: 0 }] }
    // Day 6 is Sunday 21:00 (11 hours before Day 7 Monday 08:00). Cap is 12h, so Day 7 is covered.
    expect(nextDue(s, t(6, 21), t(0, 0), t(6, 21), utcCal)).toBe(t(14, 8))
  })

  it('18: weekly Mon 08:00, last draw Saturday 08:00 (2 days early) -> this Monday 08:00', () => {
    const s: Schedule = { kind: 'weekly', days: [1], times: [{ hour: 8, minute: 0 }] }
    // Day 5 is Saturday 08:00 (48h before Day 7 Monday 08:00). Not covered.
    expect(nextDue(s, t(5, 8), t(0, 0), t(5, 8), utcCal)).toBe(t(7, 8))
  })

  it('19: cycle 5 on 2 off, last draw on day 5 -> first time on day 1 of next cycle', () => {
    const s: Schedule = {
      kind: 'cycle',
      onDays: 5,
      offDays: 2,
      times: [{ hour: 8, minute: 0 }],
      anchor: '2026-11-16',
    }
    // Day 5 of cycle is dayOffset 4 (Fri). Next cycle day 1 is dayOffset 7 (Mon).
    expect(nextDue(s, t(4, 8, 5), t(0, 0), t(4, 9), utcCal)).toBe(t(7, 8))
  })

  it('20-21: interval adds everyHours to the last draw, or returns null with no draw', () => {
    expect(nextDue({ kind: 'interval', everyHours: 168 }, 0, 0, 0, utcCal)).toBe(7 * DAY)
    expect(nextDue({ kind: 'interval', everyHours: 12 }, 0, 0, 0, utcCal)).toBe(12 * H)
    expect(nextDue({ kind: 'interval', everyHours: 24 }, null, 0, 0, utcCal)).toBeNull()
    expect(nextDue({ kind: 'interval', everyHours: 0 }, 0, 0, 0, utcCal)).toBeNull()
  })

  it('22: asNeeded returns null with or without a draw', () => {
    expect(nextDue({ kind: 'asNeeded' }, t(0, 8), t(0, 0), t(1, 0), utcCal)).toBeNull()
    expect(nextDue({ kind: 'asNeeded' }, null, t(0, 0), t(1, 0), utcCal)).toBeNull()
  })

  it('23: draw 60 days in the past on daily returns the slot after that draw so state reads late', () => {
    const s: Schedule = { kind: 'daily', times: [{ hour: 8, minute: 0 }] }
    expect(nextDue(s, t(0, 8, 5), t(0, 0), t(60, 12), utcCal)).toBe(t(1, 8))
  })
})

describe('gapHours', () => {
  it('returns the hours between the due slot and the slot before it', () => {
    expect(
      gapHours(
        {
          kind: 'daily',
          times: [
            { hour: 8, minute: 0 },
            { hour: 20, minute: 0 },
          ],
        },
        t(0, 20),
        utcCal,
      ),
    ).toBe(12)
    expect(gapHours({ kind: 'daily', times: [{ hour: 8, minute: 0 }] }, t(1, 8), utcCal)).toBe(24)
    expect(
      gapHours({ kind: 'weekly', days: [1], times: [{ hour: 8, minute: 0 }] }, t(7, 8), utcCal),
    ).toBe(168)
    const mwf: Schedule = { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] }
    expect(gapHours(mwf, t(2, 8), utcCal)).toBe(48) // Wed from Mon
    expect(gapHours(mwf, t(4, 8), utcCal)).toBe(48) // Fri from Wed
    expect(gapHours(mwf, t(7, 8), utcCal)).toBe(72) // Mon from Fri
    expect(gapHours({ kind: 'interval', everyHours: 36 }, t(1, 0), utcCal)).toBe(36)
  })
})

describe('isValidSchedule and isValidCourse', () => {
  it('checks interval limits', () => {
    expect(isValidSchedule({ kind: 'interval', everyHours: 0.5 })).toBe(true)
    expect(isValidSchedule({ kind: 'interval', everyHours: 8760 })).toBe(true)
    expect(isValidSchedule({ kind: 'interval', everyHours: 0 })).toBe(false)
    expect(isValidSchedule({ kind: 'interval', everyHours: -1 })).toBe(false)
    expect(isValidSchedule({ kind: 'interval', everyHours: 8761 })).toBe(false)
    expect(isValidSchedule({ kind: 'interval', everyHours: Number.NaN })).toBe(false)
  })

  it('checks times count, distinctness, ascending order, and bounds', () => {
    const sixTimes = [0, 4, 8, 12, 16, 20].map((hour) => ({ hour, minute: 0 }))
    expect(isValidSchedule({ kind: 'daily', times: sixTimes })).toBe(true)
    expect(isValidSchedule({ kind: 'daily', times: [...sixTimes, { hour: 23, minute: 0 }] })).toBe(
      false,
    )
    expect(isValidSchedule({ kind: 'daily', times: [] })).toBe(false)
    expect(
      isValidSchedule({
        kind: 'daily',
        times: [
          { hour: 8, minute: 0 },
          { hour: 8, minute: 0 },
        ],
      }),
    ).toBe(false)
    expect(
      isValidSchedule({
        kind: 'daily',
        times: [
          { hour: 20, minute: 0 },
          { hour: 8, minute: 0 },
        ],
      }),
    ).toBe(false)
    expect(isValidSchedule({ kind: 'daily', times: [{ hour: 24, minute: 0 }] })).toBe(false)
    expect(isValidSchedule({ kind: 'daily', times: [{ hour: 8, minute: 60 }] })).toBe(false)
  })

  it('checks weekly days count, distinctness, ascending order, and bounds', () => {
    expect(
      isValidSchedule({
        kind: 'weekly',
        days: [1, 2, 3, 4, 5, 6, 7],
        times: [{ hour: 8, minute: 0 }],
      }),
    ).toBe(true)
    expect(isValidSchedule({ kind: 'weekly', days: [], times: [{ hour: 8, minute: 0 }] })).toBe(
      false,
    )
    expect(isValidSchedule({ kind: 'weekly', days: [1, 1], times: [{ hour: 8, minute: 0 }] })).toBe(
      false,
    )
    expect(isValidSchedule({ kind: 'weekly', days: [5, 1], times: [{ hour: 8, minute: 0 }] })).toBe(
      false,
    )
    expect(isValidSchedule({ kind: 'weekly', days: [0], times: [{ hour: 8, minute: 0 }] })).toBe(
      false,
    )
    expect(isValidSchedule({ kind: 'weekly', days: [8], times: [{ hour: 8, minute: 0 }] })).toBe(
      false,
    )
  })

  it('checks cycle limits and real calendar dates', () => {
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 365,
        offDays: 1,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2024-02-29',
      }),
    ).toBe(true)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 1,
        offDays: 365,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      }),
    ).toBe(true)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 200,
        offDays: 167,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      }),
    ).toBe(false)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 0,
        offDays: 2,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      }),
    ).toBe(false)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 5,
        offDays: 0,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      }),
    ).toBe(false)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 5,
        offDays: 2,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-02-30',
      }),
    ).toBe(false)
    expect(
      isValidSchedule({
        kind: 'cycle',
        onDays: 5,
        offDays: 2,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2025-02-29',
      }),
    ).toBe(false)
    expect(isValidSchedule({ kind: 'asNeeded' })).toBe(true)
  })

  it('checks course limits and dates', () => {
    expect(isValidCourse({ startOn: '2026-11-16', weeks: 1 })).toBe(true)
    expect(isValidCourse({ startOn: '2026-11-16', weeks: 104 })).toBe(true)
    expect(isValidCourse({ startOn: '2026-11-16', weeks: 0 })).toBe(false)
    expect(isValidCourse({ startOn: '2026-11-16', weeks: 105 })).toBe(false)
    expect(isValidCourse({ startOn: '2026-11-16', weeks: 4.5 })).toBe(false)
    expect(isValidCourse({ startOn: '2026-02-30', weeks: 8 })).toBe(false)
  })
})

describe('scheduleText', () => {
  it('matches interval wording and formats every schedule kind', () => {
    expect(scheduleText({ kind: 'interval', everyHours: 12 }, fmtTime, fmtWeekday)).toBe(
      'twice daily',
    )
    expect(scheduleText({ kind: 'interval', everyHours: 24 }, fmtTime, fmtWeekday)).toBe('daily')
    expect(scheduleText({ kind: 'interval', everyHours: 72 }, fmtTime, fmtWeekday)).toBe(
      'every 3 days',
    )
    expect(scheduleText({ kind: 'interval', everyHours: 168 }, fmtTime, fmtWeekday)).toBe('weekly')
    expect(scheduleText({ kind: 'interval', everyHours: 8 }, fmtTime, fmtWeekday)).toBe(
      'every 8 hours',
    )

    expect(
      scheduleText(
        {
          kind: 'daily',
          times: [
            { hour: 8, minute: 0 },
            { hour: 20, minute: 0 },
          ],
        },
        fmtTime,
        fmtWeekday,
      ),
    ).toBe('Daily at 08:00 and 20:00')
    expect(
      scheduleText(
        {
          kind: 'daily',
          times: [
            { hour: 8, minute: 0 },
            { hour: 14, minute: 0 },
            { hour: 20, minute: 0 },
          ],
        },
        fmtTime,
        fmtWeekday,
      ),
    ).toBe('Daily at 08:00, 14:00 and 20:00')
    expect(
      scheduleText(
        { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] },
        fmtTime,
        fmtWeekday,
      ),
    ).toBe('Mon, Wed, Fri at 08:00')
    expect(
      scheduleText(
        {
          kind: 'cycle',
          onDays: 5,
          offDays: 2,
          times: [{ hour: 8, minute: 0 }],
          anchor: '2026-11-16',
        },
        fmtTime,
        fmtWeekday,
      ),
    ).toBe('5 days on, 2 off at 08:00')
    expect(scheduleText({ kind: 'asNeeded' }, fmtTime, fmtWeekday)).toBe('As needed')
  })
})

describe('courseText', () => {
  const course = { startOn: '2026-11-16', weeks: 8 }

  it('tracks the week number, completion, before start, and missing course', () => {
    expect(courseText(null, t(0, 12), utcCal)).toBeNull()
    expect(courseText(course, t(-1, 12), utcCal)).toBeNull()
    expect(courseText(course, t(0, 12), utcCal)).toBe('Week 1 of 8')
    expect(courseText(course, t(21, 12), utcCal)).toBe('Week 4 of 8')
    expect(courseText(course, t(55, 12), utcCal)).toBe('Week 8 of 8')
    expect(courseText(course, t(56, 12), utcCal)).toBe('Course complete')
  })
})

describe('dueState', () => {
  it('reads days ahead, then hours, then quarter hours rounding up', () => {
    expect(dueState(3 * DAY, 168, 0)).toEqual({ kind: 'later', days: 3 })
    expect(dueState(DAY, 168, 0)).toEqual({ kind: 'later', days: 1 })
    expect(dueState(DAY - 1, 168, 0)).toEqual({ kind: 'soon', hours: 23 })
    expect(dueState(89 * MIN, 168, 0)).toEqual({ kind: 'soon', hours: 1 })
    expect(dueState(46 * MIN, 168, 0)).toEqual({ kind: 'soon', hours: 1 })
    expect(dueState(45 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 45 })
    expect(dueState(31 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 45 })
    expect(dueState(30 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 30 })
    expect(dueState(16 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 30 })
    expect(dueState(15 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 15 })
    expect(dueState(1, 168, 0)).toEqual({ kind: 'minutes', minutes: 15 })
  })

  it('is due for a day after, or one interval when shorter, then late', () => {
    expect(dueState(0, 168, 0)).toEqual({ kind: 'due' })
    expect(dueState(0, 168, 20 * H)).toEqual({ kind: 'due' })
    expect(dueState(0, 168, 2.5 * DAY)).toEqual({ kind: 'late', days: 2 })
    expect(dueState(0, 12, 11 * H)).toEqual({ kind: 'due' })
    expect(dueState(0, 12, 13 * H)).toEqual({ kind: 'late', days: 1 })
  })
})

describe('remainingFraction', () => {
  it('drains over the interval while days remain', () => {
    expect(remainingFraction(7 * DAY, 168, 0)).toBe(1)
    expect(remainingFraction(7 * DAY, 168, 3.5 * DAY)).toBeCloseTo(0.5, 12)
  })

  it('zooms to the last day, then the last hour', () => {
    expect(remainingFraction(7 * DAY, 168, 6 * DAY + 1)).toBeCloseTo(1, 6)
    expect(remainingFraction(7 * DAY, 168, 7 * DAY - 12 * H)).toBeCloseTo(0.5, 12)
    expect(remainingFraction(7 * DAY, 168, 7 * DAY - 30 * MIN)).toBeCloseTo(0.5, 12)
  })

  it('starts full for an interval shorter than a day', () => {
    expect(remainingFraction(12 * H, 12, 0)).toBe(1)
    expect(remainingFraction(12 * H, 12, 6 * H)).toBeCloseTo(0.5, 12)
  })

  it('stays at 0 once due', () => {
    expect(remainingFraction(0, 24, 0)).toBe(0)
    expect(remainingFraction(0, 24, 5 * H)).toBe(0)
    expect(remainingFraction(DAY, 0, 0)).toBe(0)
  })
})

describe('protocolFollowingRename', () => {
  const protocols = [{ id: 'p1', key: 'name:my peptide' }]

  it('moves the protocol when the renamed vial was the last one of its name', () => {
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', [], protocols)).toBe('p1')
  })

  it('stays with vials that still have the old name', () => {
    const others = [{ peptideId: null, name: 'My Peptide' }]
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', others, protocols)).toBeNull()
  })

  it('never replaces a protocol the new name already has', () => {
    const both = [...protocols, { id: 'p2', key: 'name:my pep' }]
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', [], both)).toBeNull()
  })

  it('does nothing when the product is unchanged or has no protocol', () => {
    expect(protocolFollowingRename('name:a', 'name:a', [], protocols)).toBeNull()
    expect(protocolFollowingRename('name:b', 'name:c', [], protocols)).toBeNull()
  })
})

describe('lastDrawFor', () => {
  const vials = [
    { id: 'a', peptideId: 'bpc-157', name: 'BPC-157' },
    { id: 'b', peptideId: 'bpc-157', name: 'BPC-157' },
    { id: 'c', peptideId: null, name: 'My Peptide' },
    { id: 'd', peptideId: null, name: ' my peptide ' },
    { id: 'e', peptideId: 'wolverine', name: 'Wolverine blend' },
  ]
  const draws = [
    { id: '5', vialId: 'e' },
    { id: '4', vialId: 'd' },
    { id: '3', vialId: 'b' },
    { id: '2', vialId: 'c' },
    { id: '1', vialId: 'a' },
  ]

  it('takes the newest draw across every vial of a catalog peptide', () => {
    expect(lastDrawFor('bpc-157', vials, draws)?.id).toBe('3')
  })

  it('matches custom peptides by name, ignoring case and spaces', () => {
    expect(lastDrawFor('name:my peptide', vials, draws)?.id).toBe('4')
  })

  it('keeps a blend as its own product', () => {
    expect(lastDrawFor('wolverine', vials, draws)?.id).toBe('5')
    expect(lastDrawFor('bpc-157', vials, draws.slice(0, 1))).toBeNull()
  })

  it('is null when no vial matches', () => {
    expect(lastDrawFor('tb-500', vials, draws)).toBeNull()
  })
})

describe('dueText', () => {
  it('formats every DueState kind including singular and plural forms', () => {
    expect(dueText({ kind: 'later', days: 3 })).toBe('Due in 3 days')
    expect(dueText({ kind: 'later', days: 1 })).toBe('Due in 1 day')
    expect(dueText({ kind: 'soon', hours: 5 })).toBe('Due in 5 hours')
    expect(dueText({ kind: 'soon', hours: 1 })).toBe('Due in 1 hour')
    expect(dueText({ kind: 'minutes', minutes: 30 })).toBe('Due in 30 minutes')
    expect(dueText({ kind: 'due' })).toBe('Due now')
    expect(dueText({ kind: 'late', days: 2 })).toBe('2 days late')
    expect(dueText({ kind: 'late', days: 1 })).toBe('1 day late')
  })
})
