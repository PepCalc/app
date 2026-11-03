import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repository } from '@/db'
import type { DrawRow, ProtocolRow, VialRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import { findPeptide } from '@/data'
import { sameProductKey } from '@/domain/listing'
import { lastDrawFor, nextDueAt } from '@/domain/schedule'
import { toEpochMs } from '@/services/time'
import { useShelfStore } from './shelf'

/** A peptide on the shelf a protocol can follow: the key vials share, and its name. */
export interface ProtocolProduct {
  key: string
  name: string
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
    addProtocol,
    updateProtocol,
    deleteProtocol,
  }
})
