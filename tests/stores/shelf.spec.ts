import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { useShelfStore } from '@/stores/shelf'

describe('shelf store draws', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('reduces balanceOf by the difference after updateDraw raises a draw dose', async () => {
    const shelf = useShelfStore()
    const vial = await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: '2026-10-20T08:00:00.000Z',
      status: 'active',
      notes: '',
    })
    const draw = await shelf.addDraw({
      vialId: vial.id,
      takenAt: '2026-10-21T08:00:00.000Z',
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })

    const before = shelf.balanceOf(shelf.vialById(vial.id)!).remainingAmount
    expect(before).toBeCloseTo(4.75, 5)

    await shelf.updateDraw(draw.id, {
      dose: { value: 0.5, unit: 'mg' },
      volumeMl: 0.2,
    })

    const freshPinia = createPinia()
    setActivePinia(freshPinia)
    const reloaded = useShelfStore()
    await reloaded.load()
    const after = reloaded.balanceOf(reloaded.vialById(vial.id)!).remainingAmount
    expect(after).toBeCloseTo(4.5, 5)
    expect(before - after).toBeCloseTo(0.25, 5)
  })
})
