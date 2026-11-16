/**
 * Dose reminders: when to remind on due days at a chosen time of day, or at exact scheduled
 * times with an optional lead, plus grouping, capping, notification wording and settings
 * sanitisation. It restates the user's schedule; it never suggests a dose. Local wall-clock
 * times come from an injected function, so this module stays free of the clock and time zone.
 */

import type { TimeOfDay } from './timeOfDay'

export { fromTimeValue, toTimeValue } from './timeOfDay'

/** Allowed lead times in minutes for time-based reminders. */
export const LEAD_MINUTES_OPTIONS = [0, 5, 10, 15, 30, 60] as const

/** One subject's reminder choices. */
export interface Reminder extends TimeOfDay {
  enabled: boolean
  /** For day-based plans: also remind the day before a dose that is not repeating. */
  dayBefore: boolean
  /** For time-based plans: minutes before each scheduled time. 0, 5, 10, 15, 30 or 60. */
  leadMinutes: number
}

export interface ReminderSettings {
  /** Show the subject's name on the lock screen; off so a glance reveals nothing. */
  showNames: boolean
  subjects: Record<string, Reminder>
}

export const DEFAULT_REMINDER: Reminder = {
  enabled: false,
  hour: 9,
  minute: 0,
  dayBefore: false,
  leadMinutes: 0,
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max

function sanitizeSubjectMap(rawMap: Record<string, unknown>): Record<string, Reminder> {
  const subjects: Record<string, Reminder> = {}
  for (const [id, raw] of Object.entries(rawMap)) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (!isInt(r.hour, 0, 23) || !isInt(r.minute, 0, 59)) continue
    const leadMinutes = (LEAD_MINUTES_OPTIONS as readonly number[]).includes(
      r.leadMinutes as number,
    )
      ? (r.leadMinutes as number)
      : 0
    subjects[id] = {
      enabled: r.enabled === true,
      hour: r.hour,
      minute: r.minute,
      dayBefore: r.dayBefore === true,
      leadMinutes,
    }
  }
  return subjects
}

/** Stored or restored reminder settings are untrusted input; keep only valid entries. */
export function sanitizeReminderSettings(value: unknown): ReminderSettings {
  if (typeof value !== 'object' || value === null) return { showNames: false, subjects: {} }
  const v = value as Record<string, unknown>
  const rawMap =
    typeof v.subjects === 'object' && v.subjects !== null
      ? v.subjects
      : typeof v.medications === 'object' && v.medications !== null
        ? v.medications
        : null
  return {
    showNames: v.showNames === true,
    subjects: rawMap ? sanitizeSubjectMap(rawMap as Record<string, unknown>) : {},
  }
}

/** Keeps reminder choices from a backup while turning every subject off for the new device. */
export function restoredReminders(value: unknown): ReminderSettings {
  const clean = sanitizeReminderSettings(value)
  const subjects: Record<string, Reminder> = {}
  for (const [id, r] of Object.entries(clean.subjects)) {
    subjects[id] = { ...r, enabled: false }
  }
  return { showNames: clean.showNames, subjects }
}

export type ReminderKind = 'day-before' | 'due' | 'late'

/**
 * The local days a dose falls due, as epoch ms anywhere inside each day, soonest first. The
 * planner places reminders on these days; it does not know how the schedule produced them.
 */
export type DueDays = readonly number[]

export interface ReminderRule {
  enabled: boolean
  hour: number
  minute: number
  /** Also remind the day before. Ignored for a repeating schedule. */
  dayBefore: boolean
}

export interface PlannedReminder {
  /** What the reminder is for, such as a medication or protocol id. */
  subjectId: string
  kind: ReminderKind
  /** Epoch ms. */
  at: number
}

export interface GroupedReminder {
  subjectIds: string[]
  kind: ReminderKind
  /** Epoch ms. */
  at: number
}

/** Epoch ms of a local wall-clock time `dayOffset` days after the day of `epochMs`. */
export type AtLocalTime = (
  epochMs: number,
  dayOffset: number,
  hour: number,
  minute: number,
) => number

/**
 * Repeating schedules get the next week of reminders, so they keep coming if the app is not
 * opened; every launch and every logged dose plans again.
 */
export const REPEATING_AHEAD = 7

/**
 * iOS silently drops pending notifications past 64 per app; capping at 60 leaves room for any
 * notification the system or a later feature adds.
 */
export const MAX_PENDING = 60

/**
 * The reminders still to come for one subject, soonest first. On each due day: a reminder at
 * the rule's time. For a schedule that is not repeating, also the day before when asked, and
 * once more the day after in case the dose was not logged. A repeating schedule is reminded on
 * its days only, at most `REPEATING_AHEAD` of them, because the next day's reminder already
 * follows.
 */
export function planReminders(input: {
  subjectId: string
  days: DueDays
  repeating: boolean
  rule: ReminderRule
  now: number
  atLocalTime: AtLocalTime
}): PlannedReminder[] {
  const { subjectId, days, repeating, rule, now, atLocalTime } = input
  if (!rule.enabled || !days.length) return []
  const at = (day: number, offset = 0) => atLocalTime(day, offset, rule.hour, rule.minute)
  if (repeating) {
    return days
      .map((day) => ({ subjectId, kind: 'due' as const, at: at(day) }))
      .filter((r) => r.at > now)
      .slice(0, REPEATING_AHEAD)
  }
  const planned: PlannedReminder[] = days.flatMap((day) => [
    ...(rule.dayBefore ? [{ subjectId, kind: 'day-before' as const, at: at(day, -1) }] : []),
    { subjectId, kind: 'due' as const, at: at(day) },
    { subjectId, kind: 'late' as const, at: at(day, 1) },
  ])
  return planned.filter((r) => r.at > now).sort((a, b) => a.at - b.at)
}

/**
 * Reminders at exact times, for a schedule that already says when each dose is: one `due`
 * reminder per time still to come, soonest first, at most `max`. `leadMinutes` moves each
 * earlier, so "10 minutes before" is possible; 0 reminds at the time itself.
 */
export function planAtTimes(input: {
  subjectId: string
  times: readonly number[]
  rule: { enabled: boolean; leadMinutes: number }
  now: number
  max: number
}): PlannedReminder[] {
  const { subjectId, times, rule, now, max } = input
  if (!rule.enabled || max <= 0 || !times.length) return []
  const leadMs = Math.max(0, rule.leadMinutes) * 60_000
  return times
    .map((t) => ({ subjectId, kind: 'due' as const, at: t - leadMs }))
    .filter((r) => r.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
}

/**
 * Reminders that fall in the same minute become one, so three subjects at 08:00 are one
 * notification, not three. A group keeps every subject id, for its text and its tap.
 */
export function groupByMinute(planned: readonly PlannedReminder[]): GroupedReminder[] {
  const ordered = [...planned].sort((a, b) => a.at - b.at)
  const byBucket = new Map<string, GroupedReminder>()
  for (const item of ordered) {
    const bucket = `${Math.floor(item.at / 60_000)}:${item.kind}`
    const existing = byBucket.get(bucket)
    if (existing) {
      if (!existing.subjectIds.includes(item.subjectId)) {
        existing.subjectIds.push(item.subjectId)
      }
    } else {
      byBucket.set(bucket, { subjectIds: [item.subjectId], kind: item.kind, at: item.at })
    }
  }
  return [...byBucket.values()]
}

/** The soonest `max` reminders. Later ones are scheduled when the app next plans. */
export function capReminders<T extends { at: number }>(planned: readonly T[], max: number): T[] {
  if (max <= 0) return []
  return [...planned].sort((a, b) => a.at - b.at).slice(0, max)
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Notification wording. Generic unless the user opted in to names, because a notification can
 * show on a locked screen. Neutral about a late dose: it was due, nothing more.
 */
export function reminderText(
  kind: ReminderKind,
  names: string | readonly string[] | null,
  options?: { count?: number; precise?: boolean },
): { title: string; body: string } {
  const list = names === null ? [] : typeof names === 'string' ? [names] : names
  const count = options?.count ?? (list.length || 1)
  if (count > 1) {
    const joined = list.length ? `${joinAnd(list)}. ` : ''
    switch (kind) {
      case 'day-before':
        return {
          title: `${count} doses due tomorrow`,
          body: list.length ? `${joinAnd(list)}.` : 'Tap to see them.',
        }
      case 'due':
        return { title: `${count} doses due`, body: `${joined}Tap to log them.` }
      case 'late':
        return { title: `${count} doses were due yesterday`, body: `${joined}Tap to log them.` }
    }
  }
  const name = list[0] ?? null
  const dose = name ? `Your ${name} dose` : 'Your dose'
  switch (kind) {
    case 'day-before':
      return { title: 'Dose due tomorrow', body: `${dose} is due tomorrow.` }
    case 'due':
      return options?.precise
        ? { title: 'Dose due', body: `${dose} is due. Tap to log it.` }
        : { title: 'Dose due today', body: `${dose} is due today. Tap to log it.` }
    case 'late':
      return {
        title: 'Dose was due yesterday',
        body: `${dose} was due yesterday. Tap to log it when you take it.`,
      }
  }
}

/**
 * A first reminder time from when the user last took a dose, to the nearest quarter hour:
 * someone who doses at 20:10 is reminded at 20:15, not at a default 9:00.
 */
export function suggestReminderTime(
  hour: number,
  minute: number,
): { hour: number; minute: number } {
  const total = Math.min(Math.round((hour * 60 + minute) / 15) * 15, 23 * 60 + 45)
  return { hour: Math.floor(total / 60), minute: total % 60 }
}
