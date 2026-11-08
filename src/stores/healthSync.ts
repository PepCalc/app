import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { repository } from '@/db'
import type { NewGlucose, NewMeasurement, NewVital } from '@/db/repository'
import {
  DEFAULT_HEALTH_SYNC,
  sanitizeHealthSync,
  type HealthSyncSettings,
  type LocalReading,
  type StoreReading,
} from '@/domain/healthSync'
import { runSync, type SyncResult } from '@/services/health/runSync'
import { appSourceId, healthStoreName } from '@/services/platform'
import { systemClock, toEpochMs, toIso } from '@/services/time'
import { useJournalStore } from './journal'

const SETTING_KEY = 'healthSync'

/**
 * Sync with the phone's health store, which the user turns on in Settings, Health apps. Off by
 * default and native only: the web build never loads the plugin. `run` imports and exports by
 * the user's choices; it asks for access only when `ask` is set, which only a tap does.
 */
export const useHealthSyncStore = defineStore('healthSync', () => {
  const settings = ref<HealthSyncSettings>({ ...DEFAULT_HEALTH_SYNC })
  const loaded = ref(false)
  const state = reactive({
    running: false,
    available: null as boolean | null,
    lastResult: null as SyncResult | null,
    error: '',
  })

  async function load() {
    settings.value = sanitizeHealthSync(await repository.getSetting(SETTING_KEY))
    loaded.value = true
  }

  async function save(changes: Partial<HealthSyncSettings>) {
    settings.value = { ...settings.value, ...changes }
    await repository.setSetting(SETTING_KEY, settings.value)
  }

  // Folded away in the web build, so it carries no plugin code.
  const native = () =>
    __NATIVE__
      ? import('@/services/health/nativeHealth')
      : Promise.reject(new Error('Health sync runs only in the apps'))

  async function checkAvailability(): Promise<boolean> {
    if (!__NATIVE__) return (state.available = false)
    try {
      state.available = (await (await native()).availability()).available
    } catch {
      state.available = false
    }
    return state.available
  }

  /** Every journal reading of a measure that can sync, as the sync rules read them. */
  function localReadings(): LocalReading[] {
    const journal = useJournalStore()
    return [
      ...journal.weights.map((w) => ({
        id: w.id,
        measure: 'weight' as const,
        at: toEpochMs(w.measuredAt),
        value: w.kg,
      })),
      ...journal.glucose.flatMap((g) =>
        g.kind === 'glucose'
          ? [{ id: g.id, measure: 'glucose' as const, at: toEpochMs(g.measuredAt), value: g.value }]
          : [],
      ),
      ...journal.vitals.map((v) =>
        v.kind === 'bp'
          ? {
              id: v.id,
              measure: 'bloodPressure' as const,
              at: toEpochMs(v.measuredAt),
              value: v.systolic,
              systolic: v.systolic,
              diastolic: v.diastolic,
            }
          : {
              id: v.id,
              measure: 'restingHeartRate' as const,
              at: toEpochMs(v.measuredAt),
              value: v.bpm,
            },
      ),
    ]
  }

  /** Readings from the store as journal rows, noting where they came from. */
  function toRows(readings: readonly StoreReading[]) {
    const notes = `From ${healthStoreName}`
    const measurements: NewMeasurement[] = []
    const glucose: NewGlucose[] = []
    const vitals: NewVital[] = []
    for (const r of readings) {
      const measuredAt = toIso(r.at)
      if (r.measure === 'weight')
        measurements.push({
          metric: 'weight',
          measuredAt,
          value: r.value,
          enteredUnit: 'kg',
          notes,
        })
      else if (r.measure === 'glucose')
        glucose.push({
          kind: 'glucose',
          measuredAt,
          value: r.value,
          enteredUnit: 'mg/dL',
          // Neither store says when in the day a reading was taken in a way the plugin passes on.
          context: 'other',
          notes,
        })
      else if (r.measure === 'bloodPressure')
        vitals.push({
          kind: 'bp',
          measuredAt,
          systolic: r.systolic ?? r.value,
          diastolic: r.diastolic!,
          notes,
        })
      else vitals.push({ kind: 'hr', measuredAt, bpm: r.value, notes })
    }
    return { measurements, glucose, vitals }
  }

  /**
   * One sync by the saved choices (see `runSync`). Null when it cannot run: on the web, while
   * one is already running, or when the store cannot be reached.
   */
  async function run(ask: boolean): Promise<SyncResult | null> {
    if (!__NATIVE__ || state.running) return null
    state.running = true
    state.error = ''
    const journal = useJournalStore()
    try {
      const { result, settings: next } = await runSync({
        settings: settings.value,
        store: await native(),
        local: localReadings,
        addToJournal: async (readings) => {
          const ids = await repository.importReadings(toRows(readings))
          await journal.load()
          return ids
        },
        ownSourceId: appSourceId,
        ask,
        now: systemClock().getTime(),
      })
      await save(next)
      state.lastResult = result
      return result
    } catch {
      state.error = `Couldn't reach ${healthStoreName}.`
      return null
    } finally {
      state.running = false
    }
  }

  /** Ask for access and keep syncing while the app is in use. */
  async function turnOn(): Promise<SyncResult | null> {
    await save({ enabled: true })
    return run(true)
  }

  async function turnOff() {
    await save({ enabled: false })
  }

  async function openHealthSettings() {
    await (await native()).openHealthSettings()
  }

  return {
    settings,
    loaded,
    state,
    load,
    save,
    checkAvailability,
    run,
    turnOn,
    turnOff,
    openHealthSettings,
  }
})
