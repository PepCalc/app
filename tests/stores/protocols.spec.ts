import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DrawRow, ProtocolRow, VialRow } from '@/db/database'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'

const PK = { halfLifeHours: 100, tmaxHours: 10 }
const NOW = Date.UTC(2026, 10, 6)
const iso = (ms: number) => new Date(ms).toISOString()

function vial(id: string, changes: Partial<VialRow> = {}): VialRow {
  return {
    id,
    peptideId: null,
    name: 'Custom',
    kind: 'single',
    unit: 'mg',
    amount: 5,
    diluentMl: 2,
    components: null,
    typicalDose: null,
    pkOverride: null,
    status: 'active',
    createdAt: iso(NOW - 1000),
    updatedAt: iso(NOW - 1000),
    ...changes,
  } as VialRow
}

function draw(vialId: string, daysAgo: number, value: number, unit = 'mg'): DrawRow {
  const at = iso(NOW - daysAgo * 86_400_000)
  return { id: `${vialId}-${daysAgo}`, vialId, takenAt: at, dose: { value, unit } } as DrawRow
}

const protocol = (key: string): ProtocolRow =>
  ({ id: 'p', key, name: 'Custom', intervalHours: 24, notes: '' }) as ProtocolRow

describe('protocol levels', () => {
  let shelf: ReturnType<typeof useShelfStore>
  let protocols: ReturnType<typeof useProtocolsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    shelf = useShelfStore()
    protocols = useProtocolsStore()
  })

  it('has nothing to draw from when no vial matches', () => {
    expect(protocols.levelsOf('name:custom')).toBeNull()
  })

  it('finds a half-life on any twin vial of a custom peptide', () => {
    shelf.vials = [vial('a'), vial('b', { pkOverride: PK })]
    const levels = protocols.levelsOf('name:custom')!
    expect(levels.pk).toEqual({ params: PK, userSupplied: true })
  })

  it('pools draws across twin vials, which level groups keep apart', () => {
    shelf.vials = [vial('a', { pkOverride: PK }), vial('b', { pkOverride: PK })]
    shelf.draws = [draw('b', 1, 2), draw('a', 2, 1)]
    const levels = protocols.levelsOf('name:custom')!
    expect(levels.history.map((d) => d.amount)).toEqual([1, 2])
    expect(levels.amount).toBe(2)
  })

  it('uses the vial’s usual dose before any draw, converted to the vial’s unit', () => {
    shelf.vials = [vial('a', { pkOverride: PK, typicalDose: { value: 250, unit: 'mcg' } })]
    const levels = protocols.levelsOf('name:custom')!
    expect(levels.amount).toBeCloseTo(0.25, 9)
  })

  it('never turns an IU dose into mass', () => {
    shelf.vials = [vial('a', { pkOverride: PK, typicalDose: { value: 10, unit: 'iu' } })]
    expect(protocols.levelsOf('name:custom')!.amount).toBeNull()
  })

  it('reports no half-life for a custom peptide without one', () => {
    shelf.vials = [vial('a')]
    expect(protocols.levelsOf('name:custom')!.pk).toBeNull()
  })

  it('projects a protocol once a draw exists', () => {
    shelf.vials = [vial('a', { pkOverride: PK })]
    expect(protocols.projectionOf(protocol('name:custom'), NOW)).toBeNull()
    shelf.draws = [draw('a', 1, 1)]
    const found = protocols.projectionOf(protocol('name:custom'), NOW)!
    expect(found.userSupplied).toBe(true)
    expect(found.projection.relative).toBe(false)
  })

  it('has no projection for a peptide without a half-life, however many draws', () => {
    shelf.vials = [vial('a')]
    shelf.draws = [draw('a', 1, 1)]
    expect(protocols.projectionOf(protocol('name:custom'), NOW)).toBeNull()
  })
})
