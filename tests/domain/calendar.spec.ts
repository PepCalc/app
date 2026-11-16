import { describe, expect, it } from 'vitest'
import {
  calendarTitle,
  describeInterval,
  googleCalendarUrl,
  icsFile,
  outlookCalendarUrl,
  recurrenceRule,
  type CalendarEvent,
} from '@/domain/calendar'

const event: CalendarEvent = {
  uid: 'med-1-20261105@pepcalc.com',
  title: 'Dose due',
  description: 'From your schedule in PepCalc; add it again if your dose day changes.',
  start: { year: 2026, month: 11, day: 5, hour: 9, minute: 0 },
  end: { year: 2026, month: 11, day: 5, hour: 9, minute: 15 },
  startUtc: '2026-11-05T09:00:00.000Z',
  endUtc: '2026-11-05T09:15:00.000Z',
  timeZone: 'Europe/London',
  recurrence: { kind: 'everyDays', days: 7 },
  createdUtc: '2026-10-30T12:00:00.000Z',
}

describe('recurrenceRule', () => {
  it('writes whole weeks as weekly and anything else as days', () => {
    expect(recurrenceRule({ kind: 'everyDays', days: 7 })).toBe('FREQ=WEEKLY;INTERVAL=1')
    expect(recurrenceRule({ kind: 'everyDays', days: 14 })).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(recurrenceRule({ kind: 'everyDays', days: 1 })).toBe('FREQ=DAILY;INTERVAL=1')
    expect(recurrenceRule({ kind: 'everyDays', days: 10 })).toBe('FREQ=DAILY;INTERVAL=10')
    expect(() => recurrenceRule({ kind: 'everyDays', days: 0 })).toThrow(RangeError)
  })

  it('writes weekly weekdays as BYDAY and returns null for dates or none', () => {
    expect(recurrenceRule({ kind: 'weekdays', days: [1, 3, 5] })).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(recurrenceRule({ kind: 'dates', dates: ['2026-11-05', '2026-11-06'] })).toBeNull()
    expect(recurrenceRule({ kind: 'none' })).toBeNull()
  })

  it('describes the interval in words', () => {
    expect(describeInterval(7)).toBe('every week')
    expect(describeInterval(14)).toBe('every 2 weeks')
    expect(describeInterval(1)).toBe('every day')
    expect(describeInterval(3)).toBe('every 3 days')
  })
})

describe('calendar links', () => {
  it('fills a repeating Google Calendar event at local time', () => {
    const url = new URL(googleCalendarUrl(event))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Dose due')
    expect(url.searchParams.get('dates')).toBe('20261105T090000/20261105T091500')
    expect(url.searchParams.get('ctz')).toBe('Europe/London')
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1')
  })

  it('carries BYDAY in the Google Calendar link for weekdays', () => {
    const url = new URL(
      googleCalendarUrl({ ...event, recurrence: { kind: 'weekdays', days: [1, 3, 5] } }),
    )
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
  })

  it('fills an Outlook event in UTC on the chosen host', () => {
    const url = new URL(outlookCalendarUrl(event, 'outlook.office.com'))
    expect(url.host).toBe('outlook.office.com')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('subject')).toBe('Dose due')
    expect(url.searchParams.get('startdt')).toBe('2026-11-05T09:00:00Z')
    expect(url.searchParams.get('enddt')).toBe('2026-11-05T09:15:00Z')
  })

  it('names the subject only when asked', () => {
    expect(calendarTitle(null)).toBe('Dose due')
    expect(calendarTitle('Wegovy')).toBe('Wegovy dose due')
  })
})

describe('icsFile', () => {
  const ics = icsFile(event)

  it('writes one repeating event with an alert, in floating local time', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('\r\nDTSTART:20261105T090000\r\n')
    expect(ics).toContain('\r\nDTEND:20261105T091500\r\n')
    expect(ics).toContain('\r\nDTSTAMP:20261030T120000Z\r\n')
    expect(ics).toContain('\r\nRRULE:FREQ=WEEKLY;INTERVAL=1\r\n')
    expect(ics).toContain('\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\n')
  })

  it('writes RDATE lines and no RRULE for explicit dates', () => {
    const cycleIcs = icsFile({
      ...event,
      recurrence: { kind: 'dates', dates: ['2026-11-05', '2026-11-06', '2026-11-12'] },
    })
    expect(cycleIcs).not.toContain('RRULE:')
    expect(cycleIcs).toContain('\r\nRDATE:20261106T090000\r\n')
    expect(cycleIcs).toContain('\r\nRDATE:20261112T090000\r\n')
  })

  it('puts two events inside one VCALENDAR block', () => {
    const second: CalendarEvent = {
      ...event,
      uid: 'med-1-20261105-1@pepcalc.com',
      start: { year: 2026, month: 11, day: 5, hour: 21, minute: 0 },
      end: { year: 2026, month: 11, day: 5, hour: 21, minute: 15 },
    }
    const multi = icsFile([event, second])
    expect(multi.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(multi.match(/END:VCALENDAR/g)).toHaveLength(1)
    expect(multi.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(multi.match(/END:VEVENT/g)).toHaveLength(2)
  })

  it('escapes text and folds long lines', () => {
    expect(ics).toContain('DESCRIPTION:From your schedule in PepCalc\\; add it again')
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(
      'DESCRIPTION:From your schedule in PepCalc\\; add it again if your dose day changes.',
    )
  })
})
