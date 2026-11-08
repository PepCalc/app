import { Health, type HealthDataType, type HealthSample } from '@capgo/capacitor-health'
import type { HealthMeasure, HealthReading, StoreReading, SyncDirection } from '@/domain/healthSync'
import { reads, writes } from '@/domain/healthSync'
import { toEpochMs, toIso } from '@/services/time'

/**
 * The phone's health store through @capgo/capacitor-health: Apple Health on iOS, Health
 * Connect on Android. Loaded only by the native builds (see `stores/healthSync.ts`), so the
 * web build carries none of it. Everything stays on the device: the plugin talks to the
 * operating system, never to a server.
 */
const TYPES: Record<HealthMeasure, HealthDataType> = {
  weight: 'weight',
  glucose: 'bloodGlucose',
  bloodPressure: 'bloodPressure',
  restingHeartRate: 'restingHeartRate',
}

const MEASURE_OF = new Map(Object.entries(TYPES).map(([m, t]) => [t, m as HealthMeasure]))

/** Readings per request; a glucose monitor's months of history take several. */
const PAGE = 5000

export async function availability(): Promise<{ available: boolean; reason?: string }> {
  const result = await Health.isAvailable()
  return { available: result.available, reason: result.reason }
}

/**
 * Read access to import and write access to export the chosen measures. With `ask`, the system
 * sheet asks for any not yet decided; without it, nothing is shown, so ongoing sync never
 * interrupts. Returns the measures the store will give and take. iOS never says whether a read
 * was allowed, so a read it hides counts as allowed and simply returns nothing.
 */
export async function access(
  measures: readonly HealthMeasure[],
  direction: SyncDirection,
  ask: boolean,
): Promise<{ read: HealthMeasure[]; write: HealthMeasure[] }> {
  const types = measures.map((m) => TYPES[m])
  const options = {
    read: reads(direction) ? types : [],
    write: writes(direction) ? types : [],
  }
  const status = ask
    ? await Health.requestAuthorization({ ...options, requestHistoryAccess: reads(direction) })
    : await Health.checkAuthorization(options)
  const back = (list: HealthDataType[]) =>
    list.flatMap((t) => {
      const m = MEASURE_OF.get(t)
      return m ? [m] : []
    })
  const deniedReads = new Set(back(status.readDenied))
  return {
    read: reads(direction) ? measures.filter((m) => !deniedReads.has(m)) : [],
    write: back(status.writeAuthorized),
  }
}

function toReading(measure: HealthMeasure, s: HealthSample): StoreReading {
  return {
    measure,
    at: toEpochMs(s.startDate),
    value: s.value,
    ...(measure === 'bloodPressure' && { systolic: s.systolic, diastolic: s.diastolic }),
    platformId: s.platformId,
    sourceId: s.sourceId,
  }
}

/**
 * Every reading of `measure` from `since` to `until`, oldest first. Reads a page at a time,
 * each starting at the last one's time, so a monitor's long history is never cut short; a
 * reading on a page boundary comes twice and is dropped by its id.
 */
export async function readMeasure(
  measure: HealthMeasure,
  since: number,
  until: number,
): Promise<StoreReading[]> {
  const out: StoreReading[] = []
  const seen = new Set<string>()
  let from = since
  for (;;) {
    const { samples } = await Health.readSamples({
      dataType: TYPES[measure],
      startDate: toIso(from),
      endDate: toIso(until),
      limit: PAGE,
      ascending: true,
    })
    for (const s of samples) {
      if (s.platformId && seen.has(s.platformId)) continue
      if (s.platformId) seen.add(s.platformId)
      out.push(toReading(measure, s))
    }
    const last = samples[samples.length - 1]
    if (samples.length < PAGE || !last) return out
    const lastAt = toEpochMs(last.startDate)
    // A full page all at one instant cannot move forward; stop rather than loop.
    if (lastAt <= from) return out
    from = lastAt
  }
}

export async function writeReading(r: HealthReading): Promise<void> {
  const at = toIso(r.at)
  await Health.saveSample({
    dataType: TYPES[r.measure],
    value: r.value,
    startDate: at,
    endDate: at,
    ...(r.measure === 'bloodPressure' && { systolic: r.systolic, diastolic: r.diastolic }),
  })
}

/** Health Connect's own screen, where access is changed or revoked. Android only. */
export async function openHealthSettings(): Promise<void> {
  await Health.openHealthConnectSettings()
}
