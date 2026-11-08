import {
  importStart,
  reads,
  readingsToExport,
  readingsToImport,
  writes,
  type HealthMeasure,
  type HealthReading,
  type HealthSyncSettings,
  type LocalReading,
  type StoreReading,
} from '@/domain/healthSync'
import { toEpochMs, toIso } from '@/services/time'

/** The health store as sync uses it; `nativeHealth.ts` in the apps, a fake in tests. */
export interface HealthStoreApi {
  access(
    measures: readonly HealthMeasure[],
    direction: HealthSyncSettings['direction'],
    ask: boolean,
  ): Promise<{ read: HealthMeasure[]; write: HealthMeasure[] }>
  readMeasure(measure: HealthMeasure, since: number, until: number): Promise<StoreReading[]>
  writeReading(r: HealthReading): Promise<void>
}

export interface SyncResult {
  imported: number
  exported: number
  /** Readings the store refused to take, such as a measure whose write access was turned off. */
  failed: number
}

export interface SyncDeps {
  settings: HealthSyncSettings
  store: HealthStoreApi
  /** The journal's readings as they are now; called again after an import. */
  local: () => LocalReading[]
  /** Adds readings to the journal, returning the new rows' ids. */
  addToJournal: (readings: StoreReading[]) => Promise<string[]>
  /** The app's id, as the store reports it for readings this app wrote. */
  ownSourceId: string
  ask: boolean
  now: number
}

/**
 * One sync by the user's choices: import new readings from the store, then export the
 * journal's readings it does not have. Returns the counts and the settings to save, with
 * the bookkeeping that keeps the next sync from repeating this one.
 */
export async function runSync(
  deps: SyncDeps,
): Promise<{ result: SyncResult; settings: HealthSyncSettings }> {
  const { settings: s, store, now } = deps
  const granted = await store.access(s.measures, s.direction, deps.ask)
  const result: SyncResult = { imported: 0, exported: 0, failed: 0 }
  const inHealth = new Set(s.inHealth)
  const since = importStart(s.lastSyncAt ? toEpochMs(s.lastSyncAt) : null)
  let taken = s.taken.filter((t) => t.at >= since)
  const seen: StoreReading[] = []

  if (reads(s.direction)) {
    for (const measure of granted.read) seen.push(...(await store.readMeasure(measure, since, now)))
    const fresh = readingsToImport(
      seen,
      deps.local(),
      granted.read,
      [deps.ownSourceId],
      new Set(taken.map((t) => t.id)),
    )
    if (fresh.length) {
      const ids = await deps.addToJournal(fresh)
      ids.forEach((id) => inHealth.add(id))
      taken = [
        ...taken,
        ...fresh.flatMap((r) => (r.platformId ? [{ id: r.platformId, at: r.at }] : [])),
      ]
      result.imported = ids.length
    }
  }

  if (writes(s.direction) && granted.write.length) {
    const { send, found } = readingsToExport(deps.local(), granted.write, inHealth, seen)
    found.forEach((r) => inHealth.add(r.id))
    for (const r of send) {
      try {
        await store.writeReading(r)
        inHealth.add(r.id)
        result.exported++
      } catch {
        result.failed++
      }
    }
  }

  const existing = new Set(deps.local().map((r) => r.id))
  return {
    result,
    settings: {
      ...s,
      lastSyncAt: toIso(now),
      inHealth: [...inHealth].filter((id) => existing.has(id)),
      taken,
    },
  }
}
