import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db, repository } from '@/db'
import { restoredHealthSync } from '@/domain/healthSync'
import { fakeNative } from '../fakeNative'

vi.mock(
  '@/services/health/nativeHealth',
  async () => (await import('../fakeNative')).fakeNative.api,
)

const { useHealthSyncStore } = await import('@/stores/healthSync')
const { useJournalStore } = await import('@/stores/journal')

const NOW = Date.now()
const RECENT = new Date(NOW - 3_600_000).toISOString()

describe('healthSync store (native)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    fakeNative.reset()
    setActivePinia(createPinia())
    await Promise.all([useJournalStore().load(), useHealthSyncStore().load()])
  })

  it('1. persists save({ enabled: true }) across a fresh Pinia and load()', async () => {
    const health = useHealthSyncStore()
    await health.save({ enabled: true })

    setActivePinia(createPinia())
    const reloaded = useHealthSyncStore()
    await reloaded.load()
    expect(reloaded.settings.enabled).toBe(true)
  })

  it('2 & 3. syncs one reading each way and stores bookkeeping', async () => {
    fakeNative.reset([
      {
        measure: 'weight',
        at: NOW - 7_200_000,
        value: 81,
        platformId: 'scale-1',
        sourceId: 'scale',
      },
    ])
    const journal = useJournalStore()
    await journal.addWeight({ measuredAt: RECENT, kg: 80.4, enteredUnit: 'kg', notes: '' })

    const health = useHealthSyncStore()
    const outcome = await health.run(true)
    expect(outcome).toEqual({ status: 'synced', result: { imported: 1, exported: 1, failed: 0 } })

    const stored = await repository.getSetting<typeof health.settings>('healthSync')
    expect(stored?.lastSyncAt).toEqual(expect.any(String))
    expect(stored?.inHealth).toHaveLength(2)
    expect(stored?.taken).toHaveLength(1)
  })

  it('4. imports and exports nothing on the second sync after a restart', async () => {
    fakeNative.reset([
      {
        measure: 'weight',
        at: NOW - 7_200_000,
        value: 81,
        platformId: 'scale-1',
        sourceId: 'scale',
      },
    ])
    await useJournalStore().addWeight({
      measuredAt: RECENT,
      kg: 80.4,
      enteredUnit: 'kg',
      notes: '',
    })
    await useHealthSyncStore().run(true)
    expect(fakeNative.readings).toHaveLength(2)

    setActivePinia(createPinia())
    await Promise.all([useJournalStore().load(), useHealthSyncStore().load()])
    const second = await useHealthSyncStore().run(false)
    expect(second).toEqual({ status: 'synced', result: { imported: 0, exported: 0, failed: 0 } })
    expect(fakeNative.readings).toHaveLength(2)
  })

  it('5. export-only sync does not re-send readings after a restart', async () => {
    await useJournalStore().addWeight({
      measuredAt: RECENT,
      kg: 80.4,
      enteredUnit: 'kg',
      notes: '',
    })
    const health = useHealthSyncStore()
    await health.save({ direction: 'export' })
    expect(await health.run(true)).toEqual({
      status: 'synced',
      result: { imported: 0, exported: 1, failed: 0 },
    })

    setActivePinia(createPinia())
    await Promise.all([useJournalStore().load(), useHealthSyncStore().load()])
    expect(await useHealthSyncStore().run(false)).toEqual({
      status: 'synced',
      result: { imported: 0, exported: 0, failed: 0 },
    })
    expect(fakeNative.readings).toHaveLength(1)
  })

  it('6. reports failed store stage when access rejects', async () => {
    fakeNative.setAccessError(new Error('Health Connect unavailable'))
    const health = useHealthSyncStore()
    const outcome = await health.run(true)
    expect(outcome).toEqual({ status: 'failed', stage: 'store' })
    expect(health.state.error).toBe("Couldn't reach Health Connect.")
    expect(health.state.running).toBe(false)
  })

  it('7. reports failed save stage when repository.setSetting rejects after runSync', async () => {
    fakeNative.reset([
      {
        measure: 'weight',
        at: NOW - 7_200_000,
        value: 81,
        platformId: 'scale-1',
        sourceId: 'scale',
      },
    ])
    vi.spyOn(repository, 'setSetting').mockRejectedValueOnce(new Error('QuotaExceededError'))
    const health = useHealthSyncStore()
    const outcome = await health.run(true)
    expect(outcome).toEqual({
      status: 'failed',
      stage: 'save',
      result: { imported: 1, exported: 0, failed: 0 },
    })
    expect(useJournalStore().weights).toHaveLength(1)
  })

  it('8. returns busy when run is called while a sync is already running', async () => {
    let releaseAccess: (() => void) | undefined
    fakeNative.setOnAccess(
      () =>
        new Promise<void>((resolve) => {
          releaseAccess = resolve
        }),
    )
    const health = useHealthSyncStore()
    const first = health.run(true)
    const second = await health.run(false)
    expect(second).toEqual({ status: 'busy' })
    await vi.waitFor(() => expect(releaseAccess).toBeDefined())
    releaseAccess!()
    expect(await first).toEqual({
      status: 'synced',
      result: { imported: 0, exported: 0, failed: 0 },
    })
  })

  it('9. turnOn() returns the sync outcome and stores enabled', async () => {
    const health = useHealthSyncStore()
    const outcome = await health.turnOn()
    expect(outcome).toEqual({
      status: 'synced',
      result: { imported: 0, exported: 0, failed: 0 },
    })
    setActivePinia(createPinia())
    await useHealthSyncStore().load()
    expect(useHealthSyncStore().settings.enabled).toBe(true)
  })

  it('10. keeps user choices and clears bookkeeping through restoredHealthSync', async () => {
    const health = useHealthSyncStore()
    const restored = restoredHealthSync({
      measures: ['weight'],
      direction: 'export',
      schedule: 'ongoing',
      enabled: true,
      lastSyncAt: RECENT,
      inHealth: ['w1'],
      taken: [{ id: 'p1', at: 1 }],
    })
    await health.save(restored)

    setActivePinia(createPinia())
    const reloaded = useHealthSyncStore()
    await reloaded.load()
    expect(reloaded.settings).toEqual({
      measures: ['weight'],
      direction: 'export',
      schedule: 'ongoing',
      enabled: false,
      lastSyncAt: null,
      inHealth: [],
      taken: [],
    })
  })
})
