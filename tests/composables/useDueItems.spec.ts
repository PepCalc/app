import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { db, repository } from '@/db'
import { useDueItems } from '@/composables/useDueItems'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'

const HOUR_MS = 3_600_000

describe('useDueItems', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('includes protocols with a vial, skips protocols without a vial, and logs from the active vial', async () => {
    const nowMs = new Date(2026, 10, 16, 12, 0).getTime()
    const vial = await repository.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mcg',
      amount: 5000,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 250, unit: 'mcg' },
      pkOverride: null,
      reconstitutedAt: new Date(nowMs - 48 * HOUR_MS).toISOString(),
      status: 'active',
      notes: '',
    })
    await repository.addDraw({
      vialId: vial.id,
      takenAt: new Date(nowMs - 10 * HOUR_MS).toISOString(),
      dose: { value: 250, unit: 'mcg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await repository.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'interval', everyHours: 24 },
      plannedDose: { value: 250, unit: 'mcg' },
      course: null,
      notes: '',
    })
    // Protocol whose vial was deleted: should not appear.
    await repository.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      schedule: { kind: 'interval', everyHours: 168 },
      plannedDose: null,
      course: null,
      notes: '',
    })

    await Promise.all([useShelfStore().load(), useProtocolsStore().load()])
    const log = useLogStore()
    const startSpy = vi.spyOn(log, 'start')

    const { items } = useDueItems(ref(nowMs))
    expect(items.value).toHaveLength(1)
    expect(items.value[0]!.title).toBe('BPC-157')
    expect(items.value[0]!.dueAt).toBe(nowMs + 14 * HOUR_MS)
    expect(items.value[0]!.detail).toContain('Planned: 250 mcg')
    expect(items.value[0]!.vialId).toBe(vial.id)

    items.value[0]!.log()
    expect(startSpy).toHaveBeenCalledWith('dose', { vialId: vial.id })
  })

  it('orders asNeeded protocols after dated items with no due time', async () => {
    const nowMs = new Date(2026, 10, 16, 12, 0).getTime()
    await repository.addVial({
      peptideId: 'pt-141',
      name: 'PT-141',
      kind: 'single',
      unit: 'mg',
      amount: 10,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: null,
      status: 'active',
      notes: '',
    })
    await repository.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mcg',
      amount: 5000,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: null,
      status: 'active',
      notes: '',
    })
    await repository.addProtocol({
      key: 'pt-141',
      name: 'PT-141',
      schedule: { kind: 'asNeeded' },
      plannedDose: null,
      course: null,
      notes: '',
    })
    await repository.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'daily', times: [{ hour: 20, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })

    await Promise.all([useShelfStore().load(), useProtocolsStore().load()])
    const { items } = useDueItems(ref(nowMs))
    expect(items.value.map((i) => i.title)).toEqual(['BPC-157', 'PT-141'])
    expect(items.value[1]!.dueAt).toBeNull()
    expect(items.value[1]!.asNeeded).toBe(true)
  })
})
