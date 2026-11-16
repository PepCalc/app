import { sortByTime, type SortDirection } from './listing'

export const ENTRY_KINDS = ['dose', 'weight', 'symptom', 'glucose', 'vital', 'photo'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** One logged thing as a list shows it. Text is already formatted in the user's units. */
export interface Entry {
  /** The row's id in its own table. Unique within a kind. */
  id: string
  kind: EntryKind
  /** Epoch milliseconds. */
  at: number
  /** The main line: "7.5 mg Zepbound", "82.4 kg", "Nausea". */
  title: string
  /** The second line, without the date: "Abdomen, left", "Fasting", "Mild". */
  detail: string
  notes: string
}

/** Entries of the chosen kinds; an empty set means all. */
export function filterEntries(entries: readonly Entry[], kinds: ReadonlySet<EntryKind>): Entry[] {
  if (kinds.size === 0) return [...entries]
  return entries.filter((e) => kinds.has(e.kind))
}

/** Entries grouped by local day, days and entries in `direction` order. `dayStart` is injected. */
export function groupByDay(
  entries: readonly Entry[],
  dayStart: (at: number) => number,
  direction: SortDirection,
): { day: number; entries: Entry[] }[] {
  const sorted = sortByTime(entries, (e) => e.at, direction)
  const groups = new Map<number, Entry[]>()
  for (const entry of sorted) {
    const day = dayStart(entry.at)
    const list = groups.get(day)
    if (list) list.push(entry)
    else groups.set(day, [entry])
  }
  const sign = direction === 'desc' ? -1 : 1
  return [...groups.entries()]
    .map(([day, list]) => ({ day, entries: list }))
    .sort((a, b) => sign * (a.day - b.day))
}

/** How many entries of each kind, for the filter chips. */
export function countByKind(entries: readonly Entry[]): Record<EntryKind, number> {
  const counts = Object.fromEntries(ENTRY_KINDS.map((k) => [k, 0])) as Record<EntryKind, number>
  for (const e of entries) counts[e.kind] += 1
  return counts
}
