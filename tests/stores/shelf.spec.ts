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

  it('remainingOf sums active vials of one peptide and ignores archived ones and other peptides', async () => {
    const shelf = useShelfStore()
    const a1 = await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-20T08:00:00.000Z',
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: a1.id,
      takenAt: '2026-10-21T08:00:00.000Z',
      dose: { value: 500, unit: 'mcg' },
      volumeMl: 0.2,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 10,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-22T08:00:00.000Z',
      status: 'active',
      notes: '',
    })
    await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-10T08:00:00.000Z',
      status: 'archived',
      notes: '',
    })
    await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-20T08:00:00.000Z',
      status: 'active',
      notes: '',
    })

    const rem = shelf.remainingOf('bpc-157')
    expect(rem).not.toBeNull()
    expect(rem!.unit).toBe('mg')
    expect(rem!.amount).toBeCloseTo(14.5, 5)
    expect(rem!.vialCount).toBe(2)
    expect(shelf.remainingOf('missing')).toBeNull()
  })

  it('vialsOf orders active vials first', async () => {
    const shelf = useShelfStore()
    const archived = await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-25T08:00:00.000Z',
      status: 'archived',
      notes: '',
    })
    const active = await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-20T08:00:00.000Z',
      status: 'active',
      notes: '',
    })

    expect(shelf.vialsOf('bpc-157').map((v) => v.id)).toEqual([active.id, archived.id])
  })
})
