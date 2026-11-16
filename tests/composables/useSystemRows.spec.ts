import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { db, repository } from '@/db'
import { useSystemRows } from '@/composables/useSystemRows'
import { useShelfStore } from '@/stores/shelf'

const DAY_MS = 86_400_000

describe('useSystemRows', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('includes active curves, drops peptides without curves, and drops cleared doses', async () => {
    const nowMs = new Date(2026, 10, 16, 12, 0).getTime()

    const sema = await repository.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: null,
      status: 'active',
      notes: '',
    })
    const bpc = await repository.addVial({
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
    const cleared = await repository.addVial({
      peptideId: 'tirzepatide',
      name: 'Tirzepatide',
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

    await repository.addDraw({
      vialId: sema.id,
      takenAt: new Date(nowMs - DAY_MS).toISOString(),
      dose: { value: 0.5, unit: 'mg' },
      volumeMl: 0.2,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await repository.addDraw({
      vialId: bpc.id,
      takenAt: new Date(nowMs - DAY_MS).toISOString(),
      dose: { value: 250, unit: 'mcg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    // Tirzepatide half-life is ~5 days; 90 days ago is well past its clearance horizon.
    await repository.addDraw({
      vialId: cleared.id,
      takenAt: new Date(nowMs - 90 * DAY_MS).toISOString(),
      dose: { value: 2.5, unit: 'mg' },
      volumeMl: 0.5,
      syringeId: 'u100-1ml',
      notes: '',
    })

    await useShelfStore().load()
    const { rows } = useSystemRows(ref(nowMs))

    expect(rows.value).toHaveLength(1)
    expect(rows.value[0]!.label).toBe('Semaglutide')
    expect(rows.value[0]!.amountText).toMatch(/mg$/)
    expect(rows.value[0]!.percentOfPeak).toBeGreaterThanOrEqual(0)
    expect(rows.value[0]!.percentOfPeak).toBeLessThanOrEqual(100)
    expect(rows.value[0]!.trace.length).toBeGreaterThan(0)
  })
})
