import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type PepcalcDb, type ProtocolRow } from '@/db/database'
import { exportBackup, parseBackup, restoreBackup } from '@/db/backup'

const fixedClock = () => new Date('2026-11-16T12:00:00.000Z')

let db: PepcalcDb
let counter = 0

beforeEach(async () => {
  db = createDatabase(`backup-spec-${++counter}`)
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('backup schedules (v6 -> v7)', () => {
  it('restores a version 6 backup with protocols mapped to interval schedules', () => {
    const v6 = {
      format: 'pepcalc-backup',
      version: 6,
      exportedAt: '2026-11-16T12:00:00.000Z',
      vials: [],
      draws: [],
      protocols: [
        {
          id: 'p1',
          key: 'semaglutide',
          name: 'Semaglutide',
          intervalHours: 168,
          notes: 'weekly',
          createdAt: '2026-11-01T08:00:00.000Z',
          updatedAt: '2026-11-01T08:00:00.000Z',
        },
        {
          id: 'p2',
          key: 'name:bad',
          name: 'Bad',
          intervalHours: 0,
          notes: '',
          createdAt: '2026-11-01T08:00:00.000Z',
          updatedAt: '2026-11-01T08:00:00.000Z',
        },
      ],
      measurements: [],
      symptoms: [],
      glucose: [],
      vitals: [],
      photos: [],
      settings: [],
    }
    const parsed = parseBackup(JSON.stringify(v6))
    expect(parsed.protocols[0]).toMatchObject({
      id: 'p1',
      schedule: { kind: 'interval', everyHours: 168 },
      plannedDose: null,
      course: null,
    })
    expect('intervalHours' in parsed.protocols[0]!).toBe(false)
    expect(parsed.protocols[1]?.schedule).toEqual({ kind: 'asNeeded' })
  })

  it('round-trips every schedule kind, plannedDose, and course in version 7', async () => {
    const rows: ProtocolRow[] = [
      {
        id: 'p1',
        key: 'semaglutide',
        name: 'Semaglutide',
        schedule: { kind: 'interval', everyHours: 168 },
        plannedDose: { value: 0.5, unit: 'mg' },
        course: { startOn: '2026-11-02', weeks: 8 },
        notes: 'interval',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'p2',
        key: 'bpc-157',
        name: 'BPC-157',
        schedule: {
          kind: 'daily',
          times: [
            { hour: 8, minute: 0 },
            { hour: 20, minute: 0 },
          ],
        },
        plannedDose: { value: 250, unit: 'mcg' },
        course: null,
        notes: '',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'p3',
        key: 'cjc-1295',
        name: 'CJC-1295',
        schedule: { kind: 'weekly', days: [1, 3, 5], times: [{ hour: 8, minute: 0 }] },
        plannedDose: null,
        course: null,
        notes: '',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'p4',
        key: 'epitalon',
        name: 'Epitalon',
        schedule: {
          kind: 'cycle',
          onDays: 5,
          offDays: 2,
          times: [{ hour: 21, minute: 0 }],
          anchor: '2026-11-16',
        },
        plannedDose: null,
        course: { startOn: '2026-11-16', weeks: 4 },
        notes: '',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'p5',
        key: 'pt-141',
        name: 'PT-141',
        schedule: { kind: 'asNeeded' },
        plannedDose: null,
        course: null,
        notes: '',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
      },
    ]
    await db.protocols.bulkAdd(rows)

    const json = JSON.stringify(await exportBackup(db, fixedClock))
    const parsed = parseBackup(json)
    expect(parsed.version).toBe(7)
    expect(parsed.protocols).toHaveLength(5)

    const other = createDatabase(`backup-restore-${++counter}`)
    await other.open()
    await restoreBackup(other, parsed)
    expect(await other.protocols.orderBy('id').toArray()).toEqual(rows)
    await other.delete()
  })

  it('refuses version 7 with an invalid schedule before anything is written', () => {
    const bad = {
      format: 'pepcalc-backup',
      version: 7,
      exportedAt: '2026-11-16T12:00:00.000Z',
      vials: [],
      draws: [],
      protocols: [
        {
          id: 'p1',
          key: 'bpc-157',
          name: 'BPC-157',
          schedule: { kind: 'daily', times: [] },
          plannedDose: null,
          course: null,
          notes: '',
          createdAt: '2026-11-01T08:00:00.000Z',
          updatedAt: '2026-11-01T08:00:00.000Z',
        },
      ],
      measurements: [],
      symptoms: [],
      glucose: [],
      vitals: [],
      photos: [],
      settings: [],
    }
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/Protocol 1/)
  })

  it('refuses a backup with version 8', () => {
    const v8 = {
      format: 'pepcalc-backup',
      version: 8,
      vials: [],
      draws: [],
      protocols: [],
      measurements: [],
      symptoms: [],
      glucose: [],
      vitals: [],
      photos: [],
      settings: [],
    }
    expect(() => parseBackup(JSON.stringify(v8))).toThrow(/newer version/)
  })

  it('keeps reminder choices on restore while turning every reminder off', async () => {
    const backup = await exportBackup(db, fixedClock)
    backup.settings = [
      {
        key: 'reminders',
        value: {
          showNames: true,
          subjects: {
            p1: { enabled: true, hour: 8, minute: 30, dayBefore: true, leadMinutes: 10 },
          },
        },
      },
    ]
    const other = createDatabase(`backup-restore-reminders-${++counter}`)
    await other.open()
    await restoreBackup(other, backup)
    const row = await other.settings.get('reminders')
    expect(row?.value).toEqual({
      showNames: true,
      subjects: {
        p1: { enabled: false, hour: 8, minute: 30, dayBefore: true, leadMinutes: 10 },
      },
    })
    await other.delete()
  })
})
