/**
 * The only module that reads the clock or formats dates. Records store UTC ISO-8601 strings;
 * display uses the device's locale and time zone through Intl.
 */

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

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The local day of the week: "Monday". */
export function formatWeekday(epochMs: number): string {
  return weekdayFormat.format(new Date(epochMs))
}

/** The local time of day: "8:30 PM". */
export function formatTime(epochMs: number): string {
  return timeFormat.format(new Date(epochMs))
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

/** "Sep 29 – Oct 29, 2026" in the device's locale. */
export function formatDateRange(startMs: number, endMs: number): string {
  return dateFormat.formatRange(new Date(startMs), new Date(endMs))
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
