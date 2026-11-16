/**
 * The only module that reads the clock or formats dates. Records store UTC ISO-8601 strings;
 * display uses the device's locale and time zone through Intl.
 */
import type { LocalCalendar, Weekday } from '@/domain/schedule'
import type { TimeOfDay } from '@/domain/timeOfDay'

export type Clock = () => Date

export const systemClock: Clock = () => new Date()

export function nowIso(clock: Clock = systemClock): string {
  return clock().toISOString()
}

export function toEpochMs(iso: string): number {
  return Date.parse(iso)
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const shortFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Medium date and short time; takes a stored ISO string or epoch milliseconds. */
export function formatDateTime(at: string | number): string {
  return dateTimeFormat.format(new Date(at))
}

export function formatDate(at: string | number): string {
  return dateFormat.format(new Date(at))
}

export function formatShort(epochMs: number): string {
  return shortFormat.format(new Date(epochMs))
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The local time of day: "8:30 PM". */
export function formatTime(epochMs: number): string {
  return timeFormat.format(new Date(epochMs))
}

/** Local day heading for a timeline: "Today", "Yesterday", or the formatted date. */
export function formatDay(epochMs: number, now: number): string {
  const day = atLocalTime(epochMs, 0, 0, 0)
  if (day === atLocalTime(now, 0, 0, 0)) return 'Today'
  if (day === atLocalTime(now, -1, 0, 0)) return 'Yesterday'
  return formatDate(day)
}

/** Value for an <input type="datetime-local"> in the device's local time. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse a datetime-local value (device local time) back to UTC ISO. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString()
}

/** Whole days elapsed between two instants (ISO strings or epoch ms), for "mixed 9 days ago". */
export function daysBetween(from: string | number, to: Date | number): number {
  const toMs = typeof to === 'number' ? to : to.getTime()
  const fromMs = typeof from === 'number' ? from : Date.parse(from)
  return Math.floor((toMs - fromMs) / 86_400_000)
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelativeDays(days: number): string {
  return relative.format(-days, 'day')
}

/** Human duration for PK figures: "11 min", "5.0 h", "7.0 days". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Number(hours.toFixed(1))} h`
  return `${Number((hours / 24).toFixed(1))} days`
}

const axisDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const axisHourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Label for a chart axis tick: the date for spans over three days ("Oct 29"), otherwise the
 * date and time, so ticks on short charts stay unambiguous.
 */
export function formatAxisTick(epochMs: number, spanMs: number): string {
  return spanMs > 3 * 86_400_000
    ? axisDayFormat.format(new Date(epochMs))
    : `${axisDayFormat.format(new Date(epochMs))}, ${axisHourFormat.format(new Date(epochMs))}`
}

/** "Oct 29" in the device's locale. */
export function formatMonthDay(epochMs: number): string {
  return axisDayFormat.format(new Date(epochMs))
}

const todayHeadingFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** "Mon, Nov 16" in the device's locale, for Today's heading. */
export function formatTodayDate(epochMs: number): string {
  return todayHeadingFormat.format(new Date(epochMs))
}

/** "Sep 29 – Oct 29, 2026" in the device's locale. */
export function formatDateRange(startMs: number, endMs: number): string {
  return dateFormat.formatRange(new Date(startMs), new Date(endMs))
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

/** "Thursday" for a due date, in the device's language. */
export function formatWeekday(epochMs: number): string {
  return weekdayFormat.format(new Date(epochMs))
}

/** A Date for an epoch, for APIs that take one (native notification schedules). */
export function toDate(epochMs: number): Date {
  return new Date(epochMs)
}

/** The local calendar date and wall-clock time of an instant, for calendar files and links. */
export function localParts(epochMs: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const d = new Date(epochMs)
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  }
}

/** The device's IANA time zone ("Europe/London"), so a calendar repeats at local time. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** UTC ISO for an epoch, such as a chosen file's last-modified time. */
export function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

/** Local calendar date as YYYY-MM-DD, for file names. */
export function fileDate(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Epoch ms of `hour`:`minute` on the local calendar day `dayOffset` days after the day of
 * `epochMs`. Built from local date parts, so midnight stays midnight across a daylight-saving
 * change.
 */
export function atLocalTime(epochMs: number, dayOffset: number, hour: number, minute: number) {
  const d = new Date(epochMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute).getTime()
}

const utcTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** Wall-clock time of day formatted for the device locale (12 or 24 hour). */
export function formatTimeOfDay(t: TimeOfDay): string {
  return utcTimeFormat.format(Date.UTC(2024, 0, 1, t.hour, t.minute))
}

const weekdayFormats = {
  short: new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }),
  narrow: new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' }),
}

/** Localized weekday name for an ISO weekday (1 Monday to 7 Sunday). */
export function weekdayName(day: Weekday, width: 'short' | 'long' | 'narrow' = 'short'): string {
  // 2024-01-01 is a Monday, so day 1..7 map directly to Jan 1..7.
  return weekdayFormats[width].format(Date.UTC(2024, 0, day))
}

/** ISO weekday (1 Monday to 7 Sunday) of the local calendar day containing `epochMs`. */
export function weekdayOf(epochMs: number): Weekday {
  const d = new Date(epochMs).getDay()
  return (d === 0 ? 7 : d) as Weekday
}

/** Whole local calendar days from `from` (`YYYY-MM-DD`) to the local day of `epochMs`. */
export function daysSince(from: string, epochMs: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  if (!match) return Number.NaN
  const d = new Date(epochMs)
  const targetUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const fromUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Math.round((targetUtc - fromUtc) / 86_400_000)
}

/** First day of the week for the device's locale (1 Monday to 7 Sunday), defaulting to Monday. */
export function firstDayOfWeek(localeTag?: string): Weekday {
  try {
    const tag = localeTag ?? Intl.DateTimeFormat().resolvedOptions().locale
    const loc = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number }
      weekInfo?: { firstDay?: number }
    }
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay
    if (first !== undefined && Number.isInteger(first) && first >= 1 && first <= 7) {
      return first as Weekday
    }
  } catch {
    // Fall back to Monday when Intl.Locale week info is unavailable.
  }
  return 1
}

export const localCalendar: LocalCalendar = {
  atLocalTime,
  weekdayOf,
  daysSince,
}
