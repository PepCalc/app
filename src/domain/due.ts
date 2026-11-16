/** Something the user takes on a schedule, as Today lists it. */
export interface DueItem {
  /** Stable id: the medication's or the protocol's. */
  id: string
  title: string
  /** "Last: 7.5 mg, Mon 9 Nov", or "No doses yet". Formatted by the adapter. */
  detail: string
  /** Epoch ms the next dose is due; null before the first dose. */
  dueAt: number | null
}

/** Soonest first; items with no due time last, in title order. */
export function sortDue<T extends DueItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.dueAt !== null && b.dueAt !== null) return a.dueAt - b.dueAt
    if (a.dueAt !== null) return -1
    if (b.dueAt !== null) return 1
    return a.title.localeCompare(b.title)
  })
}
