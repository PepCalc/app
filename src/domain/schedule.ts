/**
 * When the next dose of a protocol falls, from the last logged draw and the user's own interval.
 * This restates the user's schedule; it never suggests a dose, an interval or a change.
 */
import { sameProductKey } from './listing'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function nextDueAt(lastDrawAt: number | null, intervalHours: number): number | null {
  if (lastDrawAt === null || !(intervalHours > 0)) return null
  return lastDrawAt + intervalHours * HOUR_MS
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
export function intervalText(hours: number): string {
  if (hours === 12) return 'twice daily'
  if (hours === 24) return 'daily'
  if (hours === 168) return 'weekly'
  if (hours % 24 === 0) return `every ${hours / 24} days`
  return `every ${hours} hours`
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
