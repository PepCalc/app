import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repository } from '@/db'
import type { DrawRow, VialRow } from '@/db/database'
import type { NewDraw, NewVial } from '@/db/repository'
import { vialBalance, type VialBalance } from '@/domain/inventory'
import { findPeptide, syringeCatalog } from '@/data'
import { sortByTime, vialNumbers } from '@/domain/listing'
import {
  dosesFromVials,
  groupLevelsByPeptide,
  levelKey,
  pooledDoses,
  startingDose,
  type LevelDraw,
  type LevelVial,
  type PeptideLevels,
  type StartingDose,
} from '@/domain/levels'
import type { PkParameters } from '@/domain/pk'
import { roundTo, unitLabel, type AmountUnit, type Quantity } from '@/domain/units'
import { daysBetween, formatRelativeDays, toEpochMs } from '@/services/time'

/**
 * The shelf (vials) and the draw log. The whole dataset is small enough to hold in memory,
 * so the store loads everything once and reloads after each write.
 */
export const useShelfStore = defineStore('shelf', () => {
  const vials = ref<VialRow[]>([])
  const draws = ref<DrawRow[]>([])
  const loaded = ref(false)

  async function load() {
    const [v, d] = await Promise.all([repository.listVials(), repository.listDraws()])
    vials.value = v
    draws.value = d
    loaded.value = true
  }

  /** Epoch ms of the vial's latest draw, else when it was mixed, else when it was added. */
  function lastUsedAt(vial: VialRow): number {
    const latest = drawsFor(vial.id)[0]
    return toEpochMs(latest?.takenAt ?? vial.reconstitutedAt ?? vial.createdAt)
  }

  /** Most recently used first, so the vial in use today leads the shelf. */
  const byLastUsed = computed(() => sortByTime(vials.value, lastUsedAt, 'desc'))
  const activeVials = computed(() => byLastUsed.value.filter((v) => v.status === 'active'))
  const archivedVials = computed(() => byLastUsed.value.filter((v) => v.status === 'archived'))

  const numbers = computed(() =>
    vialNumbers(vials.value.map((v) => ({ ...v, createdAt: toEpochMs(v.createdAt) }))),
  )

  /** "BPC-157 #2" when another vial of the same peptide exists, else the plain name. */
  function displayName(vial: VialRow): string {
    const n = numbers.value.get(vial.id)
    return n === undefined ? vial.name : `${vial.name} #${n}`
  }

  /** The vial's number among vials of the same peptide, or undefined when it has no twin. */
  function vialNumber(vial: VialRow): number | undefined {
    return numbers.value.get(vial.id)
  }

  /** Draws newest first, grouped by vial id. */
  const drawsByVial = computed(() => {
    const map = new Map<string, DrawRow[]>()
    for (const d of draws.value) {
      const list = map.get(d.vialId) ?? []
      list.push(d)
      map.set(d.vialId, list)
    }
    return map
  })

  function vialById(id: string): VialRow | undefined {
    return vials.value.find((v) => v.id === id)
  }

  function drawsFor(vialId: string): DrawRow[] {
    return drawsByVial.value.get(vialId) ?? []
  }

  function balanceOf(vial: VialRow): VialBalance {
    return vialBalance(vial, drawsFor(vial.id), vial.typicalDose ?? undefined)
  }

  /** PK parameters for a vial: the user's override wins, then the catalog's human data. */
  function pkFor(vial: VialRow): { params: PkParameters; userSupplied: boolean } | null {
    if (vial.pkOverride) return { params: vial.pkOverride, userSupplied: true }
    const pk = findPeptide(vial.peptideId)?.pk
    return pk ? { params: pk, userSupplied: false } : null
  }

  const levelVials = computed<LevelVial[]>(() =>
    vials.value.map((v) => ({
      id: v.id,
      peptideId: v.peptideId,
      label: findPeptide(v.peptideId)?.name ?? v.name,
      pk: pkFor(v),
    })),
  )
  const levelDraws = computed<LevelDraw[]>(() =>
    draws.value.map((d) => ({ vialId: d.vialId, at: toEpochMs(d.takenAt), dose: d.dose })),
  )

  /** Every draw pooled per peptide across vials, newest group first (see groupLevelsByPeptide). */
  const levelGroups = computed<PeptideLevels[]>(() =>
    groupLevelsByPeptide(levelVials.value, levelDraws.value),
  )

  /**
   * Doses of the vial's peptide from all of its vials, in `unit`: the body does not know which
   * vial a dose came from. Doses that cannot be expressed in `unit` (IU and mass) are left out.
   */
  function pooledDosesFor(vial: VialRow, unit: AmountUnit) {
    return pooledDoses(levelVials.value, levelDraws.value, levelKey(vial), unit)
  }

  /** Doses from exactly these vials, in `unit`: a protocol's vials can span level groups. */
  function dosesOf(vialIds: ReadonlySet<string>, unit: AmountUnit) {
    return dosesFromVials(levelDraws.value, vialIds, unit).doses
  }

  const timedDraws = computed(() => draws.value.map((d) => ({ ...d, at: toEpochMs(d.takenAt) })))

  function startingDoseFor(vial: VialRow): StartingDose<DrawRow & { at: number }> | null {
    return startingDose(vial, vials.value, timedDraws.value)
  }

  /**
   * What a new draw from `vial` is pre-filled with (see startingDose): the dose, and the syringe
   * of the draw it came from while that syringe is still in the catalog; null where nothing is
   * known, so the caller keeps its own default.
   */
  function drawDefaultsFor(vial: VialRow): { dose: Quantity | null; syringeId: string | null } {
    const start = startingDoseFor(vial)
    if (!start) return { dose: null, syringeId: null }
    if (start.kind === 'usual') return { dose: start.dose, syringeId: null }
    const { dose, syringeId } = start.draw
    const known = syringeCatalog.syringes.some((s) => s.id === syringeId)
    return { dose, syringeId: known ? syringeId : null }
  }

  /**
   * "Last drawn: 300 mcg, 2 days ago" when a starting dose came from a logged draw, so a
   * pre-filled dose is never mistaken for a suggestion; null for the vial's usual dose.
   */
  function startingDoseHint(vial: VialRow, now: number): string | null {
    const start = startingDoseFor(vial)
    if (!start || start.kind === 'usual') return null
    const { dose, takenAt, vialId } = start.draw
    const from = start.kind === 'other-vial' ? vialById(vialId) : undefined
    const amount = `${roundTo(dose.value, 4)} ${unitLabel(dose.unit)}`
    const when = formatRelativeDays(daysBetween(takenAt, now))
    return from
      ? `Last drawn from ${displayName(from)}: ${amount}, ${when}.`
      : `Last drawn: ${amount}, ${when}.`
  }

  async function addVial(input: NewVial): Promise<VialRow> {
    const row = await repository.addVial(input)
    await load()
    return row
  }

  async function updateVial(id: string, changes: Partial<NewVial>) {
    await repository.updateVial(id, changes)
    await load()
  }

  async function deleteVial(id: string) {
    await repository.deleteVial(id)
    await load()
  }

  async function addDraw(input: NewDraw): Promise<DrawRow> {
    const row = await repository.addDraw(input)
    await load()
    return row
  }

  async function deleteDraw(id: string) {
    await repository.deleteDraw(id)
    await load()
  }

  return {
    vials,
    draws,
    loaded,
    byLastUsed,
    activeVials,
    archivedVials,
    load,
    vialById,
    displayName,
    vialNumber,
    drawsFor,
    balanceOf,
    pkFor,
    dosesOf,
    levelGroups,
    pooledDosesFor,
    drawDefaultsFor,
    startingDoseHint,
    addVial,
    updateVial,
    deleteVial,
    addDraw,
    deleteDraw,
  }
})
