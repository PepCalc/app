import { isValidGlucose } from './glucose'
import { isValidBloodPressure, isValidHeartRate } from './vitals'

/**
 * Two-way sync with the phone's health store (Apple Health or Health Connect), as pure rules:
 * which readings to send, which to take in, and how to tell a reading already on both sides.
 * The native calls and the database live elsewhere; this decides and is unit tested.
 *
 * Neither store lets an app edit or delete another app's record, and the plugin cannot update
 * one it wrote, so sync only ever adds. A reading counts as already present when the other side
 * has the same measure within a minute and the same value to the precision a person reads it.
 */
export type HealthMeasure = 'weight' | 'glucose' | 'bloodPressure' | 'restingHeartRate'

export const HEALTH_MEASURES: readonly HealthMeasure[] = [
  'weight',
  'glucose',
  'bloodPressure',
  'restingHeartRate',
]

export const HEALTH_MEASURE_LABELS: Record<HealthMeasure, string> = {
  weight: 'Weight',
  glucose: 'Blood glucose',
  bloodPressure: 'Blood pressure',
  restingHeartRate: 'Resting heart rate',
}

export type SyncDirection = 'import' | 'export' | 'both'
export type SyncSchedule = 'once' | 'ongoing'

/** What the user chose, kept in settings. Off until they turn it on. */
export interface HealthSyncSettings {
  measures: HealthMeasure[]
  direction: SyncDirection
  schedule: SyncSchedule
  /** Ongoing sync is running. A one-time sync never sets it. */
  enabled: boolean
  /** UTC ISO time of the last finished sync, or null. */
  lastSyncAt: string | null
  /** Ids of journal rows already in the health store: sent there, taken from it, or found. */
  inHealth: string[]
  /**
   * The health store's ids for readings taken in recently, with their times. Kept only as far
   * back as the next sync reads, so a reading deleted here is not taken in again.
   */
  taken: { id: string; at: number }[]
}

export const DEFAULT_HEALTH_SYNC: HealthSyncSettings = {
  measures: [...HEALTH_MEASURES],
  direction: 'both',
  schedule: 'ongoing',
  enabled: false,
  lastSyncAt: null,
  inHealth: [],
  taken: [],
}

/** A stored value read back as settings, keeping only what is valid. */
export function sanitizeHealthSync(value: unknown): HealthSyncSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_HEALTH_SYNC }
  const v = value as Record<string, unknown>
  const measures = Array.isArray(v.measures)
    ? HEALTH_MEASURES.filter((m) => (v.measures as unknown[]).includes(m))
    : DEFAULT_HEALTH_SYNC.measures
  return {
    measures,
    direction:
      v.direction === 'import' || v.direction === 'export' || v.direction === 'both'
        ? v.direction
        : DEFAULT_HEALTH_SYNC.direction,
    schedule: v.schedule === 'once' || v.schedule === 'ongoing' ? v.schedule : 'ongoing',
    enabled: v.enabled === true,
    lastSyncAt: typeof v.lastSyncAt === 'string' ? v.lastSyncAt : null,
    inHealth: Array.isArray(v.inHealth)
      ? v.inHealth.filter((id): id is string => typeof id === 'string')
      : [],
    taken: Array.isArray(v.taken)
      ? v.taken.filter(
          (t): t is { id: string; at: number } =>
            typeof t === 'object' &&
            t !== null &&
            typeof (t as { id?: unknown }).id === 'string' &&
            Number.isFinite((t as { at?: unknown }).at),
        )
      : [],
  }
}

/**
 * Sync settings as restored from a backup: the user's choices stay, but sync is off and its
 * bookkeeping starts over. The backup may come from another phone, whose health store holds
 * none of what this one's does; the first sync then matches everything afresh.
 */
export function restoredHealthSync(value: unknown): HealthSyncSettings {
  return { ...sanitizeHealthSync(value), enabled: false, lastSyncAt: null, inHealth: [], taken: [] }
}

export const reads = (direction: SyncDirection) => direction !== 'export'
export const writes = (direction: SyncDirection) => direction !== 'import'

/**
 * One reading on either side. `value` is kg, mg/dL or bpm; blood pressure carries systolic in
 * `value` as well as in `systolic`, as both stores report it.
 */
export interface HealthReading {
  measure: HealthMeasure
  /** Epoch milliseconds. */
  at: number
  value: number
  systolic?: number
  diastolic?: number
}

/** A journal row as a reading, with its id. */
export interface LocalReading extends HealthReading {
  id: string
}

/** A reading from the health store, with its id there and the app that wrote it. */
export interface StoreReading extends HealthReading {
  platformId?: string
  sourceId?: string
}

/** Readings within this of each other are one reading taken once. */
const SAME_TIME_MS = 60_000

/** How close two values must be to be the same reading, in each measure's unit. */
const SAME_VALUE: Record<HealthMeasure, number> = {
  weight: 0.05,
  glucose: 0.5,
  bloodPressure: 0.5,
  restingHeartRate: 0.5,
}

/** The same reading: same measure, within a minute, and the same value as a person reads it. */
export function sameReading(a: HealthReading, b: HealthReading): boolean {
  if (a.measure !== b.measure || Math.abs(a.at - b.at) > SAME_TIME_MS) return false
  const tolerance = SAME_VALUE[a.measure]
  if (a.measure === 'bloodPressure') {
    return (
      Math.abs((a.systolic ?? a.value) - (b.systolic ?? b.value)) <= tolerance &&
      Math.abs((a.diastolic ?? 0) - (b.diastolic ?? 0)) <= tolerance
    )
  }
  return Math.abs(a.value - b.value) <= tolerance
}

/** Weight outside this is a typo, as the weight dialog treats it. */
const WEIGHT_RANGE_KG = { min: 20, max: 400 } as const

/** Whether a reading is one the journal would accept if typed in. */
export function isPlausible(r: HealthReading): boolean {
  switch (r.measure) {
    case 'weight':
      return (
        Number.isFinite(r.value) && r.value >= WEIGHT_RANGE_KG.min && r.value <= WEIGHT_RANGE_KG.max
      )
    case 'glucose':
      return isValidGlucose(r.value)
    case 'bloodPressure':
      return isValidBloodPressure(r.systolic ?? r.value, r.diastolic ?? Number.NaN)
    case 'restingHeartRate':
      return isValidHeartRate(r.value)
  }
}

/** Index readings by measure and minute, so matching thousands stays quick. */
function index(readings: readonly HealthReading[]) {
  const buckets = new Map<string, HealthReading[]>()
  const key = (measure: HealthMeasure, minute: number) => `${measure}:${minute}`
  for (const r of readings) {
    const k = key(r.measure, Math.floor(r.at / SAME_TIME_MS))
    buckets.set(k, [...(buckets.get(k) ?? []), r])
  }
  return (r: HealthReading) => {
    const minute = Math.floor(r.at / SAME_TIME_MS)
    return [minute - 1, minute, minute + 1].some((m) =>
      (buckets.get(key(r.measure, m)) ?? []).some((other) => sameReading(r, other)),
    )
  }
}

/**
 * What to take in from the health store: plausible readings of the chosen measures that this
 * app did not write, did not take in before, and that the journal does not already hold, once
 * each. Keeps the store's id for the `taken` list.
 */
export function readingsToImport(
  store: readonly StoreReading[],
  local: readonly HealthReading[],
  measures: readonly HealthMeasure[],
  ownSourceIds: readonly string[],
  taken: ReadonlySet<string> = new Set(),
): StoreReading[] {
  const chosen = new Set(measures)
  const held = index(local)
  const out: StoreReading[] = []
  for (const r of store) {
    if (!chosen.has(r.measure) || !isPlausible(r)) continue
    if (r.sourceId && ownSourceIds.includes(r.sourceId)) continue
    if (r.platformId && taken.has(r.platformId)) continue
    if (held(r) || out.some((o) => sameReading(o, r))) continue
    out.push(r)
  }
  return out
}

/**
 * What to send to the health store: readings of the chosen measures not sent or taken before.
 * When the store could be read, a reading already there from another app is `found` instead,
 * so it is marked as present and never sent once it falls out of the window read.
 */
export function readingsToExport(
  local: readonly LocalReading[],
  measures: readonly HealthMeasure[],
  inHealth: ReadonlySet<string>,
  store: readonly HealthReading[] = [],
): { send: LocalReading[]; found: LocalReading[] } {
  const chosen = new Set(measures)
  const present = index(store)
  const send: LocalReading[] = []
  const found: LocalReading[] = []
  for (const r of local) {
    if (!chosen.has(r.measure) || inHealth.has(r.id)) continue
    if (present(r)) found.push(r)
    else send.push(r)
  }
  return { send, found }
}

const DAY_MS = 86_400_000

/**
 * The earliest time to read from the store. The first sync reads everything the store will
 * give; later ones go back two days before the last, since a watch or a scale can deliver a
 * reading late. Matching makes the overlap harmless.
 */
export function importStart(lastSyncAt: number | null): number {
  return lastSyncAt === null ? 0 : lastSyncAt - 2 * DAY_MS
}

/** How often ongoing sync runs while the app is open or brought back. */
const ONGOING_INTERVAL_MS = 10 * 60_000

/** Whether ongoing sync is due: never run, or the last run is older than the interval. */
export function syncDue(lastSyncAt: number | null, now: number): boolean {
  return lastSyncAt === null || now - lastSyncAt >= ONGOING_INTERVAL_MS
}
