/**
 * How old a mixed vial is against a use window. The tiers are for display only: PepCalc shows
 * the age and where the limit comes from, it does not decide whether a vial is safe.
 */

export type AgeTier = 'fresh' | 'nearing' | 'past'

/** Days since mixing at which a vial turns `nearing`, and after which it is `past`. */
export interface AgeLimits {
  nearingDays: number
  pastDays: number
}

/*
 * A quarter of the window gives a week's notice on the 28-day multiple-dose limit, enough to
 * plan mixing the next vial; for a 7-day window it still leaves two days.
 */
const NOTICE_FRACTION = 0.25

/** Limits for a sourced use window of `windowDays`: past once it has elapsed, nearing in its last quarter. */
export function limitsForWindow(windowDays: number): AgeLimits {
  if (!(windowDays > 0)) throw new RangeError('A use window must be longer than 0 days.')
  return {
    nearingDays: Math.max(1, Math.floor(windowDays * (1 - NOTICE_FRACTION))),
    pastDays: windowDays,
  }
}

/** True when the limits are usable: whole days, nearing before past. */
export function areValidLimits(limits: AgeLimits): boolean {
  return (
    Number.isInteger(limits.nearingDays) &&
    Number.isInteger(limits.pastDays) &&
    limits.nearingDays >= 0 &&
    limits.pastDays > limits.nearingDays
  )
}

/**
 * The tier for a vial `ageDays` (whole days elapsed since mixing) old. Reaching `pastDays` full
 * days is past: "discard 28 days after first puncture" means a vial on day 28 is already due.
 */
export function ageTier(ageDays: number, limits: AgeLimits): AgeTier {
  if (ageDays >= limits.pastDays) return 'past'
  if (ageDays >= limits.nearingDays) return 'nearing'
  return 'fresh'
}

/** Plain-text label for a mixed vial's age, shared by VialAgeBadge and Today notices. */
export function vialAgeText(age: { days: number; tier: AgeTier; limits: AgeLimits }): string {
  const day = `Day ${age.days}`
  if (age.tier === 'past') return `${day} · ${age.limits.pastDays}-day limit reached`
  if (age.tier === 'nearing') return `${day} of ${age.limits.pastDays} · use soon`
  return `${day} of ${age.limits.pastDays}`
}
