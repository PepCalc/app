import { slots, type LocalCalendar, type Schedule } from './schedule'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** How to remind for one protocol: at exact times, or on days at the reminder's own time. */
export type ReminderPlan =
  | { mode: 'times'; times: number[] }
  | { mode: 'days'; days: number[]; repeating: boolean }
  | { mode: 'none' }

/**
 * Turns a PepCalc schedule and next due instant into either exact reminder times (for
 * fixed-time schedules and sub-daily intervals) or due days (for intervals of a day or more).
 */
export function reminderPlanFor(input: {
  schedule: Schedule
  dueAt: number | null
  now: number
  horizonDays: number
  cal: LocalCalendar
}): ReminderPlan {
  const { schedule, dueAt, now, horizonDays, cal } = input
  if (horizonDays <= 0) return { mode: 'none' }
  const horizon = now + horizonDays * DAY_MS
  switch (schedule.kind) {
    case 'asNeeded':
      return { mode: 'none' }
    case 'daily':
    case 'weekly':
    case 'cycle': {
      const from = dueAt !== null ? Math.max(now, dueAt) : now
      return { mode: 'times', times: slots(schedule, from, horizon + 1, cal) }
    }
    case 'interval': {
      if (dueAt === null || !(schedule.everyHours > 0)) return { mode: 'none' }
      if (schedule.everyHours < 24) {
        const stepMs = schedule.everyHours * HOUR_MS
        const times: number[] = []
        for (let at = dueAt; at <= horizon; at += stepMs) {
          times.push(at)
        }
        return { mode: 'times', times }
      }
      if (schedule.everyHours === 24) {
        // From today if the last logged draw is days old, so daily reminders do not stop.
        const start = Math.max(0, Math.floor((now - dueAt) / DAY_MS))
        const days = Array.from({ length: horizonDays + 1 }, (_, k) => dueAt + (start + k) * DAY_MS)
        return { mode: 'days', days, repeating: true }
      }
      return { mode: 'days', days: [dueAt], repeating: false }
    }
  }
}
