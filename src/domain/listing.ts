/** Ordering and paging of journal and shelf lists. */

export const PAGE_SIZE = 10

export type SortDirection = 'desc' | 'asc'

export interface Page<T> {
  items: T[]
  /** 1-based, clamped to the pages that exist so a delete on the last page never strands it. */
  page: number
  pageCount: number
  total: number
  /** 1-based position of the first item shown, or 0 when there are none. */
  first: number
  last: number
}

/** One page of `items`; `page` outside the range is clamped. */
export function paginate<T>(items: readonly T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
  const start = (current - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  return {
    items: slice,
    page: current,
    pageCount,
    total: items.length,
    first: slice.length ? start + 1 : 0,
    last: start + slice.length,
  }
}

/** A copy of `items` ordered by `at` (epoch ms), newest first for `desc`; ties keep their order. */
export function sortByTime<T>(
  items: readonly T[],
  at: (item: T) => number,
  direction: SortDirection,
): T[] {
  const sign = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) => sign * (at(a) - at(b)))
}
