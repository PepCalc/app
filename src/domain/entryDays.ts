import { ENTRY_KINDS, type Entry, type EntryKind } from './entries'

/** What a day holds, for its mark and its accessible name. */
export interface DayMark {
  /** Start of the local day, epoch ms. */
  day: number
  /** How many entries of each kind were logged that day. */
  counts: Partial<Record<EntryKind, number>>
  /** A dose is scheduled that day and none is logged yet (schedules or next due). */
  scheduled: boolean
}

/** True when at least one logged entry sits on `mark`. */
export function hasLoggedEntries(mark: DayMark): boolean {
  for (const kind of ENTRY_KINDS) {
    if ((mark.counts[kind] ?? 0) > 0) return true
  }
  return false
}

/** Every day that has an entry, keyed by the start of its local day. `dayStart` is injected. */
export function markDays(
  entries: readonly Entry[],
  dayStart: (at: number) => number,
): Map<number, DayMark> {
  const marks = new Map<number, DayMark>()
  for (const entry of entries) {
    const day = dayStart(entry.at)
    let mark = marks.get(day)
    if (!mark) {
      mark = { day, counts: {}, scheduled: false }
      marks.set(day, mark)
    }
    mark.counts[entry.kind] = (mark.counts[entry.kind] ?? 0) + 1
  }
  return marks
}

/** Adds scheduled days to the marks; a day with a logged dose is not also "scheduled". */
export function withScheduled(
  marks: ReadonlyMap<number, DayMark>,
  scheduledAt: readonly number[],
  dayStart: (at: number) => number,
): Map<number, DayMark> {
  const next = new Map<number, DayMark>()
  for (const [day, mark] of marks) {
    next.set(day, { day, counts: { ...mark.counts }, scheduled: mark.scheduled })
  }
  for (const at of scheduledAt) {
    const day = dayStart(at)
    const existing = next.get(day)
    if (existing) {
      if ((existing.counts.dose ?? 0) === 0) {
        existing.scheduled = true
      }
    } else {
      next.set(day, { day, counts: {}, scheduled: true })
    }
  }
  return next
}

/** One day's entries, earliest first. */
export function entriesOn(
  entries: readonly Entry[],
  day: number,
  dayStart: (at: number) => number,
): Entry[] {
  return entries.filter((e) => dayStart(e.at) === day).sort((a, b) => a.at - b.at)
}

/** "2 doses, 1 weigh-in, 3 side effects", for a day cell's accessible name. */
export function dayMarkText(mark: DayMark, plurals: Record<EntryKind, [string, string]>): string {
  const parts: string[] = []
  for (const kind of ENTRY_KINDS) {
    const count = mark.counts[kind] ?? 0
    if (count > 0) {
      const [singular, plural] = plurals[kind]
      parts.push(`${count} ${count === 1 ? singular : plural}`)
    }
  }
  if (mark.scheduled) {
    parts.push(`${plurals.dose[0]} scheduled`)
  }
  return parts.join(', ')
}
