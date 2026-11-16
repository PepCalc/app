const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const MIN_WEEKLY_SPAN_MS = 14 * DAY_MS

export interface ChangeStats {
  /** Latest minus start, in kg. */
  changeKg: number
  /** Change as a percent of the start. */
  changePercent: number
  /** Change per week over the span, in kg; null when the span is under two weeks. */
  weeklyKg: number | null
  /** Epoch ms of the start and the latest weigh-in. */
  startAt: number
  latestAt: number
}

/** The headline figures between two weigh-ins; null when they are the same weigh-in. */
export function changeStats(
  start: { at: number; kg: number },
  latest: { at: number; kg: number },
): ChangeStats | null {
  const span = latest.at - start.at
  if (span <= 0) return null
  const changeKg = latest.kg - start.kg
  const changePercent = (changeKg / start.kg) * 100
  const weeklyKg = span >= MIN_WEEKLY_SPAN_MS ? changeKg / (span / WEEK_MS) : null
  return {
    changeKg,
    changePercent,
    weeklyKg,
    startAt: start.at,
    latestAt: latest.at,
  }
}
