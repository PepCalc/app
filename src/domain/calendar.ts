/**
 * A repeating dose reminder as a calendar event: a link that opens Google Calendar or Outlook
 * on the web with the event filled in, or an iCalendar (.ics) file for any calendar app. This
 * is how the web app offers reminders, since it cannot wake itself to notify. Like
 * `schedule.ts`, it restates the user's own schedule and never suggests a dose.
 */

/** ISO weekday: 1 is Monday, 7 is Sunday. */
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

const ICS_WEEKDAYS: Record<Weekday, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
}

/** A local calendar date and wall-clock time, month 1 to 12. */
interface LocalDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export type Recurrence =
  | { kind: 'everyDays'; days: number }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'dates'; dates: string[] }
  | { kind: 'none' }

export interface CalendarEvent {
  /** Stable per subject and start, so adding the same file again updates the event. */
  uid: string
  title: string
  description: string
  start: LocalDateTime
  end: LocalDateTime
  /** The same instants in UTC ISO, for services that only take UTC. */
  startUtc: string
  endUtc: string
  /** IANA zone the local times are in. */
  timeZone: string
  recurrence: Recurrence
  /** When the event was made, UTC ISO. */
  createdUtc: string
}

/** How a subject's schedule maps to the calendar invite form. */
export type CalendarSpec =
  | { kind: 'needsDose' }
  | { kind: 'unsupported'; message: string }
  | {
      kind: 'atChosenTime'
      startDayMs: number
      recurrence: Recurrence
      description: string
      summary: string
    }
  | {
      kind: 'fixedTimes'
      starts: { startMs: number; timeLabel: string }[]
      recurrence: Recurrence
      description: string
      summary: string
    }

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** 20261105T090000: a "floating" local time, which stays at 9:00 across clock changes. */
function basicLocal(t: LocalDateTime): string {
  return `${pad(t.year, 4)}${pad(t.month)}${pad(t.day)}T${pad(t.hour)}${pad(t.minute)}00`
}

/** 20261030T120000Z from a UTC ISO string. */
function basicUtc(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

/** RFC 5545 recurrence rule for `everyDays` or `weekdays`; null when dates are explicit or none. */
export function recurrenceRule(recurrence: Recurrence): string | null {
  switch (recurrence.kind) {
    case 'everyDays': {
      const { days } = recurrence
      if (!Number.isInteger(days) || days < 1)
        throw new RangeError('The interval must be a whole number of days.')
      return days % 7 === 0 ? `FREQ=WEEKLY;INTERVAL=${days / 7}` : `FREQ=DAILY;INTERVAL=${days}`
    }
    case 'weekdays': {
      if (!recurrence.days.length) throw new RangeError('At least one weekday is required.')
      const byDay = recurrence.days.map((d) => ICS_WEEKDAYS[d]).join(',')
      return `FREQ=WEEKLY;BYDAY=${byDay}`
    }
    case 'dates':
    case 'none':
      return null
  }
}

/**
 * Google Calendar's event template. Local times with `ctz` keep the series at the same wall
 * time through daylight-saving changes; `recur` makes it repeat when expressible as an RRULE.
 */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    details: e.description,
    dates: `${basicLocal(e.start)}/${basicLocal(e.end)}`,
    ctz: e.timeZone,
  })
  const rule = recurrenceRule(e.recurrence)
  if (rule) params.set('recur', `RRULE:${rule}`)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Outlook on the web's compose link, for a personal account (outlook.live.com) or a work or
 * school one (outlook.office.com). It has no repeat parameter, so it adds one event; the user
 * sets Repeat before saving. Times are UTC, the only form it reads unambiguously.
 */
export function outlookCalendarUrl(
  e: CalendarEvent,
  host: 'outlook.live.com' | 'outlook.office.com',
): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    body: e.description,
    startdt: e.startUtc.replace(/\.\d+Z$/, 'Z'),
    enddt: e.endUtc.replace(/\.\d+Z$/, 'Z'),
  })
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`
}

/** RFC 5545 text: backslash, semicolon, comma and newline are escaped. */
function icsText(value: string): string {
  return value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
}

/** RFC 5545 folds lines longer than 75 octets, continuing with a leading space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function eventLines(e: CalendarEvent): string[] {
  const rule = recurrenceRule(e.recurrence)
  const startIsoDate = `${pad(e.start.year, 4)}-${pad(e.start.month)}-${pad(e.start.day)}`
  const rdates =
    e.recurrence.kind === 'dates'
      ? e.recurrence.dates
          .filter((d) => d !== startIsoDate)
          .map((d) => `RDATE:${d.replace(/-/g, '')}T${pad(e.start.hour)}${pad(e.start.minute)}00`)
      : []
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${basicUtc(e.createdUtc)}`,
    `DTSTART:${basicLocal(e.start)}`,
    `DTEND:${basicLocal(e.end)}`,
    ...(rule ? [`RRULE:${rule}`] : []),
    ...rdates,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(e.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
  ]
}

/**
 * An iCalendar file with one or more events and an alert at each start. Apple Calendar, Google
 * Calendar, Outlook and Android calendar apps all import it, and nothing leaves the device until
 * the user opens it in one.
 */
export function icsFile(events: CalendarEvent | readonly CalendarEvent[]): string {
  const list = Array.isArray(events) ? events : [events]
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PepCalc//Dose reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...list.flatMap(eventLines),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** "Dose due" or "Wegovy dose due": generic unless the user chose to name the subject. */
export function calendarTitle(name: string | null): string {
  return name ? `${name} dose due` : 'Dose due'
}

/** "every week", "every 2 weeks", "every day", "every 10 days". */
export function describeInterval(intervalDays: number): string {
  if (intervalDays % 7 === 0) {
    const weeks = intervalDays / 7
    return weeks === 1 ? 'every week' : `every ${weeks} weeks`
  }
  return intervalDays === 1 ? 'every day' : `every ${intervalDays} days`
}
