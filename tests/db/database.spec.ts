import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '@/db/database'

const createdDbs: string[] = []

afterEach(async () => {
  for (const name of createdDbs.splice(0)) {
    await Dexie.delete(name)
  }
})

/** Builds a real version 4 database using the v1..v4 store definitions directly. */
async function openV4(name: string) {
  createdDbs.push(name)
  const v4 = new Dexie(name)
  v4.version(1).stores({
    vials: 'id, status, peptideId, createdAt',
    draws: 'id, vialId, takenAt, [vialId+takenAt]',
    settings: 'key',
  })
  v4.version(2).stores({
    measurements: 'id, measuredAt, [metric+measuredAt]',
    symptoms: 'id, occurredAt',
    glucose: 'id, kind, measuredAt',
    photos: 'id, takenAt',
    photoImages: 'id',
    photoThumbs: 'id',
  })
  v4.version(3).stores({
    protocols: 'id, key',
  })
  v4.version(4).stores({
    vitals: 'id, kind, measuredAt',
  })
  await v4.open()
  return v4
}

describe('database migration v4 -> v5', () => {
  it('migrates intervalHours protocols to schedule kinds and leaves other tables untouched', async () => {
    const dbName = `migration-v4-v5-${Date.now()}-${Math.random()}`
    const v4 = await openV4(dbName)
    await v4.table('vials').add({
      id: 'v1',
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: '2026-10-01T08:00:00.000Z',
      status: 'active',
      notes: 'vial note',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    })
    await v4.table('draws').add({
      id: 'd1',
      vialId: 'v1',
      takenAt: '2026-10-02T08:00:00.000Z',
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: 'draw note',
      createdAt: '2026-10-02T08:00:00.000Z',
    })
    await v4.table('measurements').add({
      id: 'm1',
      metric: 'weight',
      measuredAt: '2026-10-02T07:00:00.000Z',
      value: 82.5,
      enteredUnit: 'kg',
      notes: '',
      createdAt: '2026-10-02T07:00:00.000Z',
    })
    await v4.table('protocols').bulkAdd([
      {
        id: 'p1',
        key: 'bpc-157',
        name: 'BPC-157',
        intervalHours: 12,
        notes: 'twice daily note',
        createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-03T08:00:00.000Z',
      },
      {
        id: 'p2',
        key: 'semaglutide',
        name: 'Semaglutide',
        intervalHours: 168,
        notes: 'weekly note',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-04T09:00:00.000Z',
      },
      {
        id: 'p3',
        key: 'name:custom',
        name: 'Custom',
        intervalHours: 0,
        notes: 'zero interval',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
    ])
    v4.close()

    const current = createDatabase(dbName)
    await current.open()
    const protocols = await current.protocols.orderBy('id').toArray()
    expect(protocols).toEqual([
      {
        id: 'p1',
        key: 'bpc-157',
        name: 'BPC-157',
        schedule: { kind: 'interval', everyHours: 12 },
        plannedDose: null,
        course: null,
        notes: 'twice daily note',
        createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-03T08:00:00.000Z',
      },
      {
        id: 'p2',
        key: 'semaglutide',
        name: 'Semaglutide',
        schedule: { kind: 'interval', everyHours: 168 },
        plannedDose: null,
        course: null,
        notes: 'weekly note',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-04T09:00:00.000Z',
      },
      {
        id: 'p3',
        key: 'name:custom',
        name: 'Custom',
        schedule: { kind: 'asNeeded' },
        plannedDose: null,
        course: null,
        notes: 'zero interval',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
    ])
    expect('intervalHours' in protocols[0]!).toBe(false)
    expect(await current.vials.toArray()).toHaveLength(1)
    expect((await current.vials.get('v1'))?.notes).toBe('vial note')
    expect((await current.draws.get('d1'))?.notes).toBe('draw note')
    expect((await current.measurements.get('m1'))?.value).toBe(82.5)
    current.close()
  })
})
