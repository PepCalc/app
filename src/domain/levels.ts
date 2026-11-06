import {
  chartWindow,
  simulate,
  summarizeLevels,
  type DoseEvent,
  type LevelSummary,
  type PkParameters,
  type PkPoint,
  type SimulationWindow,
} from './pk'
import { areCompatible, convert, type AmountUnit, type Quantity } from './units'

/** A vial as the level grouping needs it; the caller resolves its PK parameters. */
export interface LevelVial {
  id: string
  /** Catalog id, or null for a custom peptide. */
  peptideId: string | null
  /** Display name for the group: the catalog name, or the vial name for a custom peptide. */
  label: string
  pk: { params: PkParameters; userSupplied: boolean } | null
}

export interface LevelDraw {
  vialId: string
  /** Epoch milliseconds. */
  at: number
  dose: Quantity
}

export interface PeptideLevels {
  key: string
  peptideId: string | null
  label: string
  /** Parameters of the most recently drawn vial in the group, or null when none are known. */
  pk: { params: PkParameters; userSupplied: boolean } | null
  /** Unit of the most recent draw; every dose is expressed in it. */
  unit: AmountUnit
  /** Oldest first. */
  doses: DoseEvent[]
  /** Draws left out because their unit cannot be expressed in `unit` (IU and mass). */
  excluded: number
  vialCount: number
  latestAt: number
}

/** The pooling key: a catalog peptide shares one; a custom peptide is its own vial. */
export function levelKey(vial: { id: string; peptideId: string | null }): string {
  return vial.peptideId ?? `vial:${vial.id}`
}

/**
 * Doses in `unit` from every vial sharing `key`, oldest first. Draws that cannot be expressed in
 * `unit` (IU and mass) are left out rather than converted.
 */
export function pooledDoses(
  vials: readonly LevelVial[],
  draws: readonly LevelDraw[],
  key: string,
  unit: AmountUnit,
): { doses: DoseEvent[]; vialCount: number } {
  const ids = new Set(vials.filter((v) => levelKey(v) === key).map((v) => v.id))
  return dosesFromVials(draws, ids, unit)
}

/** Doses in `unit` from the given vials, oldest first, leaving out draws it cannot express. */
export function dosesFromVials(
  draws: readonly LevelDraw[],
  ids: ReadonlySet<string>,
  unit: AmountUnit,
): { doses: DoseEvent[]; vialCount: number } {
  const matching = draws
    .filter((d) => ids.has(d.vialId) && areCompatible(d.dose.unit, unit))
    .sort((a, b) => a.at - b.at)
  return {
    doses: matching.map((d) => ({ at: d.at, amount: convert(d.dose, unit).value })),
    vialCount: new Set(matching.map((d) => d.vialId)).size,
  }
}

/** Where a new draw's starting dose came from, so the form can say so. */
export type StartingDose<D extends LevelDraw> =
  | { kind: 'this-vial'; draw: D }
  | { kind: 'usual'; dose: Quantity }
  | { kind: 'other-vial'; draw: D }

/**
 * The dose a new draw from `vial` starts at, which the user can change: the latest draw from
 * this vial, else the vial's usual dose, else the latest draw of the same peptide from another
 * of its vials (so a fresh vial continues where the last one stopped). The usual dose outranks
 * other vials because saving a vial from the calculator sets it to the dose just entered.
 * Draws in a unit this vial cannot measure (IU against mass) are skipped.
 */
export function startingDose<D extends LevelDraw>(
  vial: { id: string; peptideId: string | null; unit: AmountUnit; typicalDose: Quantity | null },
  vials: readonly { id: string; peptideId: string | null }[],
  draws: readonly D[],
): StartingDose<D> | null {
  const latest = (pick: (d: D) => boolean) =>
    draws
      .filter((d) => pick(d) && areCompatible(d.dose.unit, vial.unit))
      .reduce<D | null>((best, d) => (best === null || d.at > best.at ? d : best), null)

  const own = latest((d) => d.vialId === vial.id)
  if (own) return { kind: 'this-vial', draw: own }
  if (vial.typicalDose) return { kind: 'usual', dose: vial.typicalDose }
  const key = levelKey(vial)
  const siblings = new Set(
    vials.filter((v) => v.id !== vial.id && levelKey(v) === key).map((v) => v.id),
  )
  const other = latest((d) => siblings.has(d.vialId))
  return other ? { kind: 'other-vial', draw: other } : null
}

/**
 * Pool every draw of the same peptide, across all of its vials, so the estimated level reflects
 * everything still in the body rather than one vial's share. Catalog peptides group by catalog
 * id; a custom peptide has no shared identity, so each custom vial is its own group. A blend is
 * its own catalog entry and stays one group: its doses are total-blend amounts. Draws whose vial
 * no longer exists are skipped because their peptide is unknown. Groups come newest first.
 */
export function groupLevelsByPeptide(
  vials: readonly LevelVial[],
  draws: readonly LevelDraw[],
): PeptideLevels[] {
  const vialsById = new Map(vials.map((v) => [v.id, v]))
  const byKey = new Map<string, { vial: LevelVial; draw: LevelDraw }[]>()
  for (const draw of draws) {
    const vial = vialsById.get(draw.vialId)
    if (!vial) continue
    const key = levelKey(vial)
    const list = byKey.get(key) ?? []
    list.push({ vial, draw })
    byKey.set(key, list)
  }

  const groups: PeptideLevels[] = []
  for (const [key, entries] of byKey) {
    entries.sort((a, b) => a.draw.at - b.draw.at)
    const latest = entries[entries.length - 1]!
    const unit = latest.draw.dose.unit
    const compatible = entries.filter((e) => areCompatible(e.draw.dose.unit, unit))
    groups.push({
      key,
      peptideId: latest.vial.peptideId,
      label: latest.vial.label,
      pk: latest.vial.pk,
      unit,
      doses: compatible.map((e) => ({ at: e.draw.at, amount: convert(e.draw.dose, unit).value })),
      excluded: entries.length - compatible.length,
      vialCount: new Set(entries.map((e) => e.vial.id)).size,
      latestAt: latest.draw.at,
    })
  }
  return groups.sort((a, b) => b.latestAt - a.latestAt)
}

export interface LevelsInput {
  params: PkParameters
  /** Logged doses, already converted to `unitLabel`. */
  doses: DoseEvent[]
  /** A draw being calculated, drawn as a dashed projection; null when only history is shown. */
  preview: DoseEvent | null
  unitLabel: string
  now: number
  lookbackHours?: number
}

export interface LevelsModel {
  window: SimulationWindow
  allDoses: DoseEvent[]
  logged: PkPoint[]
  projected: PkPoint[]
  summary: LevelSummary
}

/**
 * Everything a levels chart draws (the on-screen chart, its table, the share card and the PDF
 * report), computed once from the inputs so they always agree.
 */
export function levelsModel(input: LevelsInput): LevelsModel {
  const { params, doses, preview, now, lookbackHours } = input
  const allDoses = preview ? [...doses, preview] : doses
  const window = chartWindow(allDoses, params, now, lookbackHours)
  const logged = doses.length ? simulate(doses, params, window) : []
  const projected = preview ? simulate(allDoses, params, window) : []
  return {
    window,
    allDoses,
    logged,
    projected,
    summary: summarizeLevels(preview ? projected : logged, allDoses, params, now),
  }
}
