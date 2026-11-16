import { sortByTime } from './listing'

export interface NumberableVial {
  id: string
  peptideId: string | null
  name: string
  /** Epoch ms the vial was added; the order vials are numbered in. */
  createdAt: number
}

/** Vials of the same peptide share a key: the catalog id, else the name as the user typed it. */
export function sameProductKey(vial: { peptideId: string | null; name: string }): string {
  return vial.peptideId ?? `name:${vial.name.trim().toLowerCase()}`
}

/**
 * A number for each vial that shares its peptide with another vial: 1 for the first one added,
 * 2 for the next. Archived vials count, so archiving one never renumbers the rest. Vials with
 * no twin are left out, since a lone "#1" is noise.
 */
export function vialNumbers(vials: readonly NumberableVial[]): Map<string, number> {
  const groups = new Map<string, NumberableVial[]>()
  for (const v of vials) {
    const key = sameProductKey(v)
    groups.set(key, [...(groups.get(key) ?? []), v])
  }
  const numbers = new Map<string, number>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    sortByTime(group, (v) => v.createdAt, 'asc').forEach((v, i) => numbers.set(v.id, i + 1))
  }
  return numbers
}
