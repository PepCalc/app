import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db, type DrawRow, type ProtocolRow, type VialRow } from '@/db/database'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'

const PK = { halfLifeHours: 100, tmaxHours: 10 }
const NOW = new Date(2026, 10, 16, 12, 0).getTime() // Monday 12:00 local
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

const protocol = (key: string, overrides: Partial<ProtocolRow> = {}): ProtocolRow => ({
  id: 'p',
  key,
  name: 'Custom',
  schedule: { kind: 'interval', everyHours: 24 },
  plannedDose: null,
  course: null,
  site: null,
  siteMode: null,
  notes: '',
  createdAt: iso(NOW - 1000),
  updatedAt: iso(NOW - 1000),
  ...overrides,
})

describe('protocol levels', () => {
  let shelf: ReturnType<typeof useShelfStore>
  let protocols: ReturnType<typeof useProtocolsStore>

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    setActivePinia(createPinia())
    shelf = useShelfStore()
    protocols = useProtocolsStore()
  })

  it('draws from the most recently used vial still in use', () => {
    const custom = { name: 'Custom' }
    shelf.vials = [
      vial('old', custom),
      vial('recent', custom),
      vial('archived', { ...custom, status: 'archived' }),
      vial('other', { name: 'Other' }),
    ]
    shelf.draws = [
      draw('old', 9, 1),
      draw('recent', 2, 1),
      draw('archived', 1, 1),
      draw('other', 0, 1),
    ]
    expect(protocols.drawVialOf(protocol('name:custom'))?.id).toBe('recent')
  })

  it('has no vial to draw from once every vial is archived', () => {
    shelf.vials = [vial('a', { status: 'archived' })]
    expect(protocols.drawVialOf(protocol('name:custom'))).toBeUndefined()
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

  it('projects a protocol once a draw exists, repeating plannedDose when set or last draw otherwise', () => {
    shelf.vials = [vial('a', { pkOverride: PK })]
    expect(protocols.projectionOf(protocol('name:custom'), NOW)).toBeNull()
    shelf.draws = [draw('a', 1, 1)]
    const fromDraw = protocols.projectionOf(protocol('name:custom'), NOW)!
    expect(fromDraw.userSupplied).toBe(true)
    expect(fromDraw.projection.relative).toBe(false)
    expect(fromDraw.projection.allDoses[1]?.amount).toBe(1)

    const withPlanned = protocols.projectionOf(
      protocol('name:custom', { plannedDose: { value: 500, unit: 'mcg' } }),
      NOW,
    )!
    expect(withPlanned.projection.allDoses[1]?.amount).toBeCloseTo(0.5, 9)

    expect(
      protocols.projectionOf(protocol('name:custom', { schedule: { kind: 'asNeeded' } }), NOW),
    ).toBeNull()
  })

  it('has no projection for a peptide without a half-life, however many draws', () => {
    shelf.vials = [vial('a')]
    shelf.draws = [draw('a', 1, 1)]
    expect(protocols.projectionOf(protocol('name:custom'), NOW)).toBeNull()
  })

  it('computes nextDueOf for each schedule kind', () => {
    const monMorning = new Date(2026, 10, 16, 8, 5).getTime()
    shelf.vials = [vial('a')]
    shelf.draws = [
      {
        id: 'd1',
        vialId: 'a',
        takenAt: iso(monMorning),
        dose: { value: 1, unit: 'mg' },
      } as DrawRow,
    ]

    expect(
      protocols.nextDueOf(
        protocol('name:custom', { schedule: { kind: 'interval', everyHours: 24 } }),
        NOW,
      ),
    ).toBe(monMorning + 86_400_000)

    expect(
      protocols.nextDueOf(
        protocol('name:custom', {
          schedule: {
            kind: 'daily',
            times: [
              { hour: 8, minute: 0 },
              { hour: 20, minute: 0 },
            ],
          },
        }),
        NOW,
      ),
    ).toBe(new Date(2026, 10, 16, 20, 0).getTime())

    expect(
      protocols.nextDueOf(
        protocol('name:custom', {
          schedule: { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] },
        }),
        NOW,
      ),
    ).toBe(new Date(2026, 10, 18, 8, 0).getTime())

    expect(
      protocols.nextDueOf(
        protocol('name:custom', {
          schedule: {
            kind: 'cycle',
            onDays: 1,
            offDays: 2,
            times: [{ hour: 8, minute: 0 }],
            anchor: '2026-11-16',
          },
        }),
        NOW,
      ),
    ).toBe(new Date(2026, 10, 19, 8, 0).getTime())

    expect(
      protocols.nextDueOf(protocol('name:custom', { schedule: { kind: 'asNeeded' } }), NOW),
    ).toBeNull()
  })

  it('persists updateProtocol schedule, plannedDose, and course across reload', async () => {
    const added = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'interval', everyHours: 24 },
      plannedDose: null,
      course: null,
      notes: '',
    })
    const nextSchedule = {
      kind: 'weekly' as const,
      days: [1, 3, 5] as (1 | 3 | 5)[],
      times: [{ hour: 8, minute: 0 }],
    }
    await protocols.updateProtocol(added.id, {
      schedule: nextSchedule,
      plannedDose: { value: 250, unit: 'mcg' },
      course: { startOn: '2026-11-16', weeks: 8 },
      notes: 'updated',
    })

    setActivePinia(createPinia())
    const reloaded = useProtocolsStore()
    await reloaded.load()
    expect(reloaded.protocolFor('bpc-157')).toMatchObject({
      schedule: nextSchedule,
      plannedDose: { value: 250, unit: 'mcg' },
      course: { startOn: '2026-11-16', weeks: 8 },
      notes: 'updated',
    })
  })
})
