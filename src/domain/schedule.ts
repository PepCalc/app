/**
 * When the next dose of a protocol falls, from the last logged draw and the user's own schedule.
 * This restates the user's schedule; it never suggests a dose, an interval or a change.
 */
import type { TimeOfDay } from './timeOfDay'
import { sameProductKey } from './vials'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const SEARCH_HORIZON_DAYS = 400
const MAX_EARLY_WINDOW_MS = 12 * HOUR_MS
const MAX_PROJECTION_WEEKS = 16
const MAX_PROJECTED_DOSES = 240

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Schedule =
  /** Counted from the last draw, as every protocol was before schedules had kinds. */
  | { kind: 'interval'; everyHours: number }
  /** Every day at each time. */
  | { kind: 'daily'; times: TimeOfDay[] }
  /** On the chosen weekdays at each time. */
  | { kind: 'weekly'; days: Weekday[]; times: TimeOfDay[] }
  /** `onDays` days of doses, then `offDays` without, repeating from `anchor`. */
  | { kind: 'cycle'; onDays: number; offDays: number; times: TimeOfDay[]; anchor: string }
  /** No due time. */
  | { kind: 'asNeeded' }

/** A planned length for the whole course, to show "Week 4 of 8". */
export interface Course {
  /** Local date the course started, `YYYY-MM-DD`. */
  startOn: string
  weeks: number
}

/** Local-calendar answers the domain cannot compute itself; `services/time.ts` provides them. */
export interface LocalCalendar {
  /** Epoch ms of a wall-clock time `dayOffset` days after the local day of `epochMs`. */
  atLocalTime(epochMs: number, dayOffset: number, hour: number, minute: number): number
  /** ISO weekday of the local day of `epochMs`. */
  weekdayOf(epochMs: number): Weekday
  /** Whole local days from the local date `from` (`YYYY-MM-DD`) to the local day of `epochMs`. */
  daysSince(from: string, epochMs: number): number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const maxDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
  return day <= maxDays
}

function isValidTimes(times: unknown): times is TimeOfDay[] {
  if (!Array.isArray(times) || times.length < 1 || times.length > 6) return false
  let prev = -1
  for (const t of times) {
    if (!isRecord(t) || !isIntIn(t.hour, 0, 23) || !isIntIn(t.minute, 0, 59)) return false
    const total = t.hour * 60 + t.minute
    if (total <= prev) return false
    prev = total
  }
  return true
}

function isValidDays(days: unknown): days is Weekday[] {
  if (!Array.isArray(days) || days.length < 1 || days.length > 7) return false
  let prev = 0
  for (const d of days) {
    if (!isIntIn(d, 1, 7) || d <= prev) return false
    prev = d
  }
  return true
}

export function isValidSchedule(schedule: unknown): schedule is Schedule {
  if (!isRecord(schedule)) return false
  switch (schedule.kind) {
    case 'interval':
      return (
        typeof schedule.everyHours === 'number' &&
        Number.isFinite(schedule.everyHours) &&
        schedule.everyHours > 0 &&
        schedule.everyHours <= 8760
      )
    case 'daily':
      return isValidTimes(schedule.times)
    case 'weekly':
      return isValidDays(schedule.days) && isValidTimes(schedule.times)
    case 'cycle':
      return (
        isIntIn(schedule.onDays, 1, 365) &&
        isIntIn(schedule.offDays, 1, 365) &&
        schedule.onDays + schedule.offDays <= 366 &&
        isValidTimes(schedule.times) &&
        isValidCalendarDate(schedule.anchor)
      )
    case 'asNeeded':
      return true
    default:
      return false
  }
}

export function isValidCourse(course: unknown): course is Course {
  if (!isRecord(course)) return false
  return isValidCalendarDate(course.startOn) && isIntIn(course.weeks, 1, 104)
}

function isDoseDay(
  schedule: Extract<Schedule, { times: TimeOfDay[] }>,
  day: number,
  cal: LocalCalendar,
) {
  switch (schedule.kind) {
    case 'daily':
      return true
    case 'weekly':
      return schedule.days.includes(cal.weekdayOf(day))
    case 'cycle': {
      const d = cal.daysSince(schedule.anchor, day)
      return d >= 0 && d % (schedule.onDays + schedule.offDays) < schedule.onDays
    }
  }
}

/**
 * The scheduled times in [from, to), oldest first. Empty for `interval` and `asNeeded`, which
 * have no fixed times.
 */
export function slots(schedule: Schedule, from: number, to: number, cal: LocalCalendar): number[] {
  if (schedule.kind === 'interval' || schedule.kind === 'asNeeded' || !(from < to)) return []
  const out: number[] = []
  for (let offset = 0; ; offset++) {
    const day = cal.atLocalTime(from, offset, 0, 0)
    if (day >= to) break
    if (!isDoseDay(schedule, day, cal)) continue
    for (const time of schedule.times) {
      const slot = cal.atLocalTime(day, 0, time.hour, time.minute)
      if (slot >= from && slot < to) out.push(slot)
    }
  }
  return out
}

function previousSlot(schedule: Schedule, before: number, cal: LocalCalendar): number | null {
  const lookbackDays = schedule.kind === 'cycle' ? 370 : 8
  const prev = slots(schedule, before - lookbackDays * DAY_MS, before, cal)
  return prev.length ? prev[prev.length - 1]! : null
}

/** Hours between the due slot and the slot before it; for an interval, the interval itself. */
export function gapHours(schedule: Schedule, dueAt: number, cal: LocalCalendar): number {
  if (schedule.kind === 'interval') return schedule.everyHours
  if (schedule.kind === 'asNeeded') return 0
  const prev = previousSlot(schedule, dueAt, cal)
  if (prev !== null) return (dueAt - prev) / HOUR_MS
  const next = slots(schedule, dueAt + 1, dueAt + 370 * DAY_MS, cal)
  return next.length ? (next[0]! - dueAt) / HOUR_MS : 24
}

/**
 * When the next dose is due: for an interval, the last draw plus the interval; for fixed
 * times, the first slot the last draw does not already cover. Null when nothing is due:
 * before the first draw of an interval schedule, and always for `asNeeded`.
 */
export function nextDue(
  schedule: Schedule,
  lastDrawAt: number | null,
  createdAt: number,
  now: number,
  cal: LocalCalendar,
): number | null {
  if (schedule.kind === 'asNeeded') return null
  if (schedule.kind === 'interval') {
    if (lastDrawAt === null || !(schedule.everyHours > 0)) return null
    return lastDrawAt + schedule.everyHours * HOUR_MS
  }
  const searchFrom = lastDrawAt !== null ? lastDrawAt - MAX_EARLY_WINDOW_MS : createdAt
  const searchTo = Math.max(now, searchFrom) + SEARCH_HORIZON_DAYS * DAY_MS
  const candidates = slots(schedule, searchFrom, searchTo, cal)
  if (lastDrawAt === null) return candidates[0] ?? null
  for (let i = 0; i < candidates.length; i++) {
    const slot = candidates[i]!
    const prev = i > 0 ? candidates[i - 1]! : previousSlot(schedule, slot, cal)
    const earlyWindow =
      prev !== null ? Math.min(MAX_EARLY_WINDOW_MS, (slot - prev) / 2) : MAX_EARLY_WINDOW_MS
    if (lastDrawAt < slot - earlyWindow) return slot
  }
  return null
}

/** Future dose times up to 16 weeks out, for projecting estimated levels. */
export function projectedDoseTimes(
  schedule: Schedule,
  lastDrawAt: number | null,
  createdAt: number,
  now: number,
  cal: LocalCalendar,
): number[] {
  if (schedule.kind === 'asNeeded') return []
  const dueAt = nextDue(schedule, lastDrawAt, createdAt, now, cal)
  const start = dueAt !== null ? Math.max(now, dueAt) : now
  const horizon = now + MAX_PROJECTION_WEEKS * 7 * DAY_MS
  if (schedule.kind === 'interval') {
    if (!(schedule.everyHours > 0)) return []
    const stepMs = schedule.everyHours * HOUR_MS
    const times: number[] = []
    for (let at = start; at < horizon && times.length < MAX_PROJECTED_DOSES; at += stepMs) {
      times.push(at)
    }
    return times
  }
  return slots(schedule, start, horizon, cal).slice(0, MAX_PROJECTED_DOSES)
}

export type DueState =
  | { kind: 'later'; days: number }
  | { kind: 'soon'; hours: number }
  | { kind: 'minutes'; minutes: 15 | 30 | 45 }
  | { kind: 'due' }
  | { kind: 'late'; days: number }

/**
 * Where `now` sits against the due time: whole days a day or more ahead, hours inside a day,
 * then quarter hours inside the last 45 minutes. A quarter hour rounds up, so "45 minutes"
 * covers 31 to 45 and the label never says less time is left than there is; 46 to 59 minutes
 * reads as about an hour. After the due time it reads as due for up to a day, or for one
 * interval when that is shorter, so a twice-daily dose is never "due" once the next one is.
 */
export function dueState(dueAt: number, intervalHours: number, now: number): DueState {
  const diff = dueAt - now
  if (diff >= DAY_MS) return { kind: 'later', days: Math.round(diff / DAY_MS) }
  if (diff > 45 * MINUTE_MS) {
    return { kind: 'soon', hours: Math.min(23, Math.max(1, Math.round(diff / HOUR_MS))) }
  }
  if (diff > 0) {
    const quarters = Math.ceil(diff / (15 * MINUTE_MS))
    return { kind: 'minutes', minutes: (quarters * 15) as 15 | 30 | 45 }
  }
  const dueWindow = Math.min(DAY_MS, Math.max(HOUR_MS, intervalHours * HOUR_MS))
  if (-diff < dueWindow) return { kind: 'due' }
  return { kind: 'late', days: Math.max(1, Math.floor(-diff / DAY_MS)) }
}

/**
 * How full the countdown ring is, 1 to 0. It zooms in as the label's unit changes: over the
 * whole interval while days remain, over the last day (or the whole interval, if shorter) once
 * hours remain, and over the last hour once minutes remain. Otherwise the last day of a weekly
 * protocol would be a sliver of the ring and its last hour a dot. It never goes below 0.
 */
export function remainingFraction(dueAt: number, intervalHours: number, now: number): number {
  if (!(intervalHours > 0)) return 0
  const interval = intervalHours * HOUR_MS
  const diff = dueAt - now
  const span =
    diff >= DAY_MS ? interval : diff > 45 * MINUTE_MS ? Math.min(interval, DAY_MS) : HOUR_MS
  return Math.min(1, Math.max(0, diff / span))
}

/** "twice daily", "daily", "every 2 days", "weekly", "every 8 hours". */
function intervalText(hours: number): string {
  if (hours === 12) return 'twice daily'
  if (hours === 24) return 'daily'
  if (hours === 168) return 'weekly'
  if (hours % 24 === 0) return `every ${hours / 24} days`
  return `every ${hours} hours`
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Plain description of any schedule: "twice daily", "Daily at 08:00 and 20:00",
 * "Mon, Wed, Fri at 08:00", "5 days on, 2 off at 08:00", "As needed".
 */
export function scheduleText(
  schedule: Schedule,
  formatTime: (t: TimeOfDay) => string,
  weekdayName: (d: Weekday) => string,
): string {
  switch (schedule.kind) {
    case 'interval':
      return intervalText(schedule.everyHours)
    case 'daily':
      return `Daily at ${joinAnd(schedule.times.map((t) => formatTime(t)))}`
    case 'weekly':
      return `${schedule.days.map((d) => weekdayName(d)).join(', ')} at ${joinAnd(schedule.times.map((t) => formatTime(t)))}`
    case 'cycle': {
      const unit = schedule.onDays === 1 ? 'day' : 'days'
      return `${schedule.onDays} ${unit} on, ${schedule.offDays} off at ${joinAnd(schedule.times.map((t) => formatTime(t)))}`
    }
    case 'asNeeded':
      return 'As needed'
  }
}

/** "Week 4 of 8", or "Course complete" after the last week; null without a course. */
export function courseText(course: Course | null, now: number, cal: LocalCalendar): string | null {
  if (!course) return null
  const days = cal.daysSince(course.startOn, now)
  if (!Number.isFinite(days) || days < 0) return null
  const week = Math.floor(days / 7) + 1
  if (week > course.weeks) return 'Course complete'
  return `Week ${week} of ${course.weeks}`
}

/** Plain-language summary of a due state: "Due in 3 days", "Due now", "2 days late". */
export function dueText(state: DueState): string {
  switch (state.kind) {
    case 'later':
      return `Due in ${state.days} day${state.days === 1 ? '' : 's'}`
    case 'soon':
      return `Due in ${state.hours} hour${state.hours === 1 ? '' : 's'}`
    case 'minutes':
      return `Due in ${state.minutes} minutes`
    case 'due':
      return 'Due now'
    case 'late':
      return `${state.days} day${state.days === 1 ? '' : 's'} late`
  }
}

/**
 * Which protocol, if any, follows a vial that was renamed (or relinked) from one product to
 * another. It follows only when the vial was the last of its old product, so a protocol is never
 * pulled away from vials that still match it, and only when the new product has no protocol of
 * its own, so one is never silently replaced. Otherwise the old protocol stays, and its card
 * says when no vial matches it.
 */
export function protocolFollowingRename(
  oldKey: string,
  newKey: string,
  otherVials: readonly { peptideId: string | null; name: string }[],
  protocols: readonly { id: string; key: string }[],
): string | null {
  if (oldKey === newKey) return null
  if (otherVials.some((v) => sameProductKey(v) === oldKey)) return null
  if (protocols.some((p) => p.key === newKey)) return null
  return protocols.find((p) => p.key === oldKey)?.id ?? null
}

/**
 * The newest draw of the protocol's peptide, from any of its vials. Vials match the way the
 * shelf numbers twins (`sameProductKey`): a catalog peptide by id, a custom one by name, and a
 * blend as its own product, as the level charts treat it. Draws are newest first.
 */
export function lastDrawFor<D extends { vialId: string }>(
  key: string,
  vials: readonly { id: string; peptideId: string | null; name: string }[],
  drawsNewestFirst: readonly D[],
): D | null {
  const ids = new Set(vials.filter((v) => sameProductKey(v) === key).map((v) => v.id))
  return drawsNewestFirst.find((d) => ids.has(d.vialId)) ?? null
}
