const DAY_MS = 86_400_000

const RANGES = ['1M', '3M', '6M', '1Y', 'All'] as const
export type Range = (typeof RANGES)[number]

const RANGE_DAYS: Record<Exclude<Range, 'All'>, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
}

/** The dates a range shows, ending now; null for All. */
export function rangeWindow(range: Range, now: number): { start: number; end: number } | null {
  if (range === 'All') return null
  return { start: now - RANGE_DAYS[range] * DAY_MS, end: now }
}

/** The ranges worth offering: All, plus each shorter range the data is longer than. */
export function usefulRanges(firstAt: number | null, now: number): Range[] {
  if (firstAt === null) return ['All']
  const span = now - firstAt
  return RANGES.filter((r) => r === 'All' || span > RANGE_DAYS[r] * DAY_MS)
}
