import type { HealthMeasure, HealthReading, StoreReading, SyncDirection } from '@/domain/healthSync'
import { reads, writes } from '@/domain/healthSync'
import { appSourceId } from '@/services/platform'

function createFakeNative() {
  const readings: StoreReading[] = []
  let refuseWrites = false
  let accessError: Error | null = null
  let onAccess: (() => Promise<void>) | null = null
  let nextId = 1

  const api = {
    availability: async () => ({ available: true }),
    access: async (measures: readonly HealthMeasure[], direction: SyncDirection) => {
      if (onAccess) await onAccess()
      if (accessError) throw accessError
      return {
        read: reads(direction) ? [...measures] : [],
        write: writes(direction) ? [...measures] : [],
      }
    },
    readMeasure: async (measure: HealthMeasure, since: number, until: number) =>
      readings.filter((r) => r.measure === measure && r.at >= since && r.at <= until),
    writeReading: async (r: HealthReading) => {
      if (refuseWrites) throw new Error('not authorized')
      readings.push({ ...r, sourceId: appSourceId, platformId: `own-${nextId++}` })
    },
    openHealthSettings: async () => {},
  }

  function reset(initial: StoreReading[] = []) {
    readings.splice(0, readings.length, ...initial)
    refuseWrites = false
    accessError = null
    onAccess = null
    nextId = 1
  }

  return {
    api,
    readings,
    reset,
    setRefuseWrites: (value: boolean) => (refuseWrites = value),
    setAccessError: (error: Error | null) => (accessError = error),
    setOnAccess: (fn: (() => Promise<void>) | null) => (onAccess = fn),
  }
}

export const fakeNative = createFakeNative()
