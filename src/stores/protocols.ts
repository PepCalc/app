import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repository } from '@/db'
import type { DrawRow, ProtocolRow, VialRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import { findPeptide } from '@/data'
import type { CatalogPeptide } from '@/domain/catalog'
import { sameProductKey } from '@/domain/listing'
import type { DoseEvent, PkParameters } from '@/domain/pk'
import { projectLevels, type LevelProjection } from '@/domain/projection'
import { lastDrawFor, nextDueAt } from '@/domain/schedule'
import { areCompatible, convert, type AmountUnit } from '@/domain/units'
import { toEpochMs } from '@/services/time'
import { useShelfStore } from './shelf'

/** A peptide on the shelf a protocol can follow: the key vials share, and its name. */
export interface ProtocolProduct {
  key: string
  name: string
}

/** What a peptide's projection is drawn from, across all of its vials. */
export interface ProductLevels {
  peptide: CatalogPeptide | undefined
  pk: { params: PkParameters; userSupplied: boolean } | null
  /** Unit of the newest draw, else the unit the vial is measured in. */
  unit: AmountUnit
  /** Doses in `unit`, oldest first. */
  history: DoseEvent[]
  /** The dose a schedule repeats: the newest draw, else the vial's usual dose, else null. */
  amount: number | null
}

export interface ProtocolProjection {
  projection: LevelProjection
  unit: AmountUnit
  userSupplied: boolean
}

/**
 * The user's protocols: how often they take each peptide. A protocol belongs to the peptide,
 * not a vial, so its last dose is the newest draw from any of that peptide's vials.
 */
export const useProtocolsStore = defineStore('protocols', () => {
  const shelf = useShelfStore()
  const protocols = ref<ProtocolRow[]>([])
  const loaded = ref(false)

  async function load() {
    protocols.value = await repository.listProtocols()
    loaded.value = true
  }

  const nameOf = (vial: VialRow) => findPeptide(vial.peptideId)?.name ?? vial.name.trim()

  /** Every peptide on the shelf, archived vials included, once each, by name. */
  const products = computed<ProtocolProduct[]>(() => {
    const byKey = new Map<string, string>()
    for (const v of shelf.vials) {
      const key = sameProductKey(v)
      if (!byKey.has(key)) byKey.set(key, nameOf(v))
    }
    return [...byKey]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  /** The peptide's current name from the shelf, else the name saved with the protocol. */
  function nameFor(protocol: ProtocolRow): string {
    return products.value.find((p) => p.key === protocol.key)?.name ?? protocol.name
  }

  /** Protocols in name order, so the list does not reshuffle as doses come due. */
  const sorted = computed(() =>
    [...protocols.value].sort((a, b) => nameFor(a).localeCompare(nameFor(b))),
  )

  function protocolFor(key: string): ProtocolRow | undefined {
    return protocols.value.find((p) => p.key === key)
  }

  /** False once no vial matches, such as after a custom vial is renamed or deleted. */
  function hasVial(protocol: ProtocolRow): boolean {
    return products.value.some((p) => p.key === protocol.key)
  }

  function lastDrawOf(protocol: ProtocolRow): DrawRow | null {
    return lastDrawFor(protocol.key, shelf.vials, shelf.draws)
  }

  /** Epoch ms the next dose is due; null before the first draw. */
  function nextDueOf(protocol: ProtocolRow): number | null {
    const last = lastDrawOf(protocol)
    return nextDueAt(last ? toEpochMs(last.takenAt) : null, protocol.intervalHours)
  }

  /**
   * The curve behind a peptide on the shelf, or null with no vial of it. Vials match the way a
   * protocol does (`sameProductKey`), so twin custom vials share one curve, and the most recently
   * used vial with a half-life speaks for the rest.
   */
  function levelsOf(key: string): ProductLevels | null {
    const vials = shelf.byLastUsed.filter((v) => sameProductKey(v) === key)
    const vial = vials.find((v) => shelf.pkFor(v) !== null) ?? vials[0]
    if (!vial) return null
    const ids = new Set(vials.map((v) => v.id))
    const unit = shelf.draws.find((d) => ids.has(d.vialId))?.dose.unit ?? vial.unit
    const history = shelf.dosesOf(ids, unit)
    const usual = vial.typicalDose
    const amount =
      history[history.length - 1]?.amount ??
      (usual && areCompatible(usual.unit, unit) ? convert(usual, unit).value : null)
    return { peptide: findPeptide(vial.peptideId), pk: shelf.pkFor(vial), unit, history, amount }
  }

  /** Where a protocol's levels are heading; null without a half-life or a logged draw. */
  function projectionOf(protocol: ProtocolRow, now: number): ProtocolProjection | null {
    const levels = levelsOf(protocol.key)
    if (!levels?.pk || !levels.history.length) return null
    return {
      projection: projectLevels({
        params: levels.pk.params,
        intervalHours: protocol.intervalHours,
        amount: null,
        history: levels.history,
        now,
      }),
      unit: levels.unit,
      userSupplied: levels.pk.userSupplied,
    }
  }

  async function addProtocol(input: NewProtocol): Promise<ProtocolRow> {
    const row = await repository.addProtocol(input)
    await load()
    return row
  }

  async function updateProtocol(id: string, changes: Partial<NewProtocol>) {
    await repository.updateProtocol(id, changes)
    await load()
  }

  async function deleteProtocol(id: string) {
    await repository.deleteProtocol(id)
    await load()
  }

  return {
    protocols,
    loaded,
    load,
    products,
    sorted,
    nameFor,
    protocolFor,
    hasVial,
    lastDrawOf,
    nextDueOf,
    levelsOf,
    projectionOf,
    addProtocol,
    updateProtocol,
    deleteProtocol,
  }
})
