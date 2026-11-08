import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEALTH_SYNC,
  type HealthReading,
  type HealthSyncSettings,
  type LocalReading,
  type MonitorDay,
  type StoreReading,
} from '@/domain/healthSync'
import { runSync, type HealthStoreApi } from '@/services/health/runSync'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const DAY = 86_400_000
const OWN = 'io.github.pepcalc.app'

/** A health store in memory: what other apps wrote, plus whatever sync writes. */
function fakeStore(initial: StoreReading[], options: { refuse?: string[] } = {}) {
  const readings = [...initial]
  const reads: { since: number }[] = []
  const api: HealthStoreApi = {
    access: async (measures, direction) => ({
      read: direction === 'export' ? [] : [...measures],
      write: direction === 'import' ? [] : measures.filter((m) => !options.refuse?.includes(m)),
    }),
    readMeasure: async (measure, since, until) => {
      reads.push({ since })
      return readings.filter((r) => r.measure === measure && r.at >= since && r.at <= until)
    },
    writeReading: async (r: HealthReading) => {
      readings.push({ ...r, sourceId: OWN, platformId: `own-${readings.length}` })
    },
  }
  return { api, readings, reads }
}

/** A journal in memory, adding rows and monitor days as sync imports them. */
function fakeJournal(initial: LocalReading[]) {
  const rows = [...initial]
  const days: MonitorDay[] = []
  return {
    rows,
    days,
    local: () => rows,
    summarisedDays: () => new Set(days.map((d) => d.start)),
    addToJournal: async (readings: StoreReading[], newDays: MonitorDay[]) => {
      days.push(...newDays)
      return [
        ...readings.map((r, i) => {
          const id = `imported-${rows.length + i}`
          rows.push({ id, measure: r.measure, at: r.at, value: r.value })
          return id
        }),
        ...newDays.map((d) => `day-${d.start}`),
      ]
    },
  }
}

/** UTC days stand in for local ones, so the test reads the same in every time zone. */
const utcDay = (at: number, offset: number) => Math.floor(at / DAY) * DAY + offset * DAY

const settings = (changes: Partial<HealthSyncSettings> = {}): HealthSyncSettings => ({
  ...DEFAULT_HEALTH_SYNC,
  ...changes,
})

async function sync(
  store: ReturnType<typeof fakeStore>,
  journal: ReturnType<typeof fakeJournal>,
  s: HealthSyncSettings,
  now = NOW,
) {
  return runSync({
    settings: s,
    store: store.api,
    local: journal.local,
    summarisedDays: journal.summarisedDays,
    addToJournal: journal.addToJournal,
    localDay: utcDay,
    ownSourceId: OWN,
    ask: true,
    now,
  })
}

describe('runSync', () => {
  it('imports and exports both ways, then repeats nothing on the next run', async () => {
    const store = fakeStore([
      { measure: 'weight', at: NOW - 3 * DAY, value: 81, platformId: 'scale-1', sourceId: 'scale' },
    ])
    const journal = fakeJournal([{ id: 'w1', measure: 'weight', at: NOW - DAY, value: 80.4 }])
    const first = await sync(store, journal, settings())
    expect(first.result).toEqual({ imported: 1, exported: 1, failed: 0 })
    expect(journal.rows).toHaveLength(2)
    expect(store.readings).toHaveLength(2)
    expect(first.settings.lastSyncAt).toBe(new Date(NOW).toISOString())

    const second = await sync(store, journal, first.settings, NOW + DAY)
    expect(second.result).toEqual({ imported: 0, exported: 0, failed: 0 })
    // Later runs read whole days, from the start of the day two days before the last.
    expect(store.reads.at(-1)!.since).toBe(utcDay(NOW - 2 * DAY, 0))
  })

  it('never takes back a reading this app exported, even after it is deleted here', async () => {
    const store = fakeStore([])
    const journal = fakeJournal([{ id: 'w1', measure: 'weight', at: NOW - DAY, value: 80 }])
    const first = await sync(store, journal, settings())
    journal.rows.splice(0, 1)
    const second = await sync(store, journal, first.settings, NOW + 60_000)
    expect(second.result.imported).toBe(0)
    expect(second.settings.inHealth).toEqual([])
  })

  it('does not take in again a reading imported and then deleted here', async () => {
    const store = fakeStore([
      { measure: 'restingHeartRate', at: NOW - DAY, value: 60, platformId: 'watch-1' },
    ])
    const journal = fakeJournal([])
    const first = await sync(store, journal, settings({ direction: 'import' }))
    expect(first.result.imported).toBe(1)
    journal.rows.splice(0, 1)
    const second = await sync(store, journal, first.settings, NOW + 60_000)
    expect(second.result.imported).toBe(0)
  })

  it('import only writes nothing; export only reads nothing', async () => {
    const store = fakeStore([{ measure: 'weight', at: NOW - DAY, value: 81, platformId: 'x' }])
    const journal = fakeJournal([{ id: 'w1', measure: 'weight', at: NOW - 2 * DAY, value: 82 }])
    const imported = await sync(store, journal, settings({ direction: 'import' }))
    expect(imported.result).toEqual({ imported: 1, exported: 0, failed: 0 })
    const exportOnly = fakeStore([])
    const exported = await sync(
      exportOnly,
      fakeJournal(journal.rows),
      settings({ direction: 'export' }),
    )
    expect(exportOnly.reads).toEqual([])
    expect(exported.result.exported).toBe(2)
  })

  it('counts a refused measure as not accepted and tries it again next time', async () => {
    const store = fakeStore([])
    store.api.writeReading = async () => {
      throw new Error('not authorized')
    }
    const journal = fakeJournal([
      { id: 'h1', measure: 'restingHeartRate', at: NOW - DAY, value: 60 },
    ])
    const { result, settings: next } = await sync(store, journal, settings())
    expect(result).toEqual({ imported: 0, exported: 0, failed: 1 })
    expect(next.inHealth).toEqual([])
  })

  it('keeps a glucose monitor day as one summary, once the day is over, and only once', async () => {
    const yesterday = utcDay(NOW, -1)
    const monitor = Array.from({ length: 96 }, (_, i) => ({
      measure: 'glucose' as const,
      at: yesterday + i * 15 * 60_000,
      value: 90 + (i % 20),
      platformId: `cgm-${i}`,
      sourceId: 'com.cgm',
    }))
    const today = Array.from({ length: 30 }, (_, i) => ({
      ...monitor[i]!,
      at: utcDay(NOW, 0) + i * 5 * 60_000,
      platformId: `cgm-today-${i}`,
    }))
    const meter = {
      measure: 'glucose' as const,
      at: yesterday + 7 * 3_600_000,
      value: 101,
      platformId: 'meter-1',
      sourceId: 'com.meter',
    }
    const store = fakeStore([...monitor, ...today, meter])
    const journal = fakeJournal([])
    const first = await sync(store, journal, settings({ direction: 'import' }))
    // The meter's reading comes in on its own; yesterday's 96 become one day; today waits.
    expect(journal.rows.map((r) => r.value)).toEqual([101])
    expect(journal.days).toHaveLength(1)
    expect(journal.days[0]).toMatchObject({ start: yesterday, count: 96, min: 90, max: 109 })
    expect(first.result.imported).toBe(2)

    const second = await sync(store, journal, first.settings, NOW + 60_000)
    expect(second.result.imported).toBe(0)
    expect(journal.days).toHaveLength(1)
  })
})
