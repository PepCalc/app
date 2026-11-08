import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEALTH_SYNC,
  importStart,
  isPlausible,
  readingsToExport,
  readingsToImport,
  sameReading,
  sanitizeHealthSync,
  syncDue,
  type LocalReading,
  type StoreReading,
} from '@/domain/healthSync'

const T = Date.parse('2026-10-01T07:00:00.000Z')
const MIN = 60_000
const DAY = 86_400_000

const weight = (id: string, at: number, value: number): LocalReading => ({
  id,
  measure: 'weight',
  at,
  value,
})

describe('sameReading', () => {
  it('matches within a minute and to the precision a person reads', () => {
    const a = { measure: 'weight' as const, at: T, value: 80.0 }
    expect(sameReading(a, { ...a, at: T + 59_000, value: 80.04 })).toBe(true)
    expect(sameReading(a, { ...a, at: T + 2 * MIN })).toBe(false)
    expect(sameReading(a, { ...a, value: 80.2 })).toBe(false)
    expect(sameReading(a, { ...a, measure: 'glucose' })).toBe(false)
  })

  it('compares both blood pressure numbers', () => {
    const bp = {
      measure: 'bloodPressure' as const,
      at: T,
      value: 128,
      systolic: 128,
      diastolic: 82,
    }
    expect(sameReading(bp, { ...bp })).toBe(true)
    expect(sameReading(bp, { ...bp, diastolic: 80 })).toBe(false)
  })
})

describe('isPlausible', () => {
  it('takes only what the journal would accept if typed in', () => {
    expect(isPlausible({ measure: 'weight', at: T, value: 80 })).toBe(true)
    expect(isPlausible({ measure: 'weight', at: T, value: 2 })).toBe(false)
    expect(isPlausible({ measure: 'glucose', at: T, value: 95 })).toBe(true)
    expect(isPlausible({ measure: 'glucose', at: T, value: 5 })).toBe(false)
    expect(
      isPlausible({ measure: 'bloodPressure', at: T, value: 80, systolic: 80, diastolic: 90 }),
    ).toBe(false)
    expect(isPlausible({ measure: 'restingHeartRate', at: T, value: 61 })).toBe(true)
  })
})

describe('readingsToImport', () => {
  const store: StoreReading[] = [
    { measure: 'weight', at: T, value: 80, platformId: 'p1', sourceId: 'com.scale' },
    { measure: 'weight', at: T + DAY, value: 79.6, platformId: 'p2', sourceId: 'com.scale' },
    { measure: 'weight', at: T + 2 * DAY, value: 79.5, sourceId: 'io.github.pepcalc.app' },
    { measure: 'restingHeartRate', at: T, value: 60, platformId: 'p3' },
    { measure: 'glucose', at: T, value: 1, platformId: 'p4' },
  ]

  it('skips what the journal holds, what this app wrote, unchosen measures and typos', () => {
    const fresh = readingsToImport(
      store,
      [weight('w1', T + 20_000, 80)],
      ['weight', 'glucose'],
      ['io.github.pepcalc.app'],
    )
    expect(fresh.map((r) => r.platformId)).toEqual(['p2'])
  })

  it('skips readings taken in before, and repeats within one batch', () => {
    const twice = [...store, { ...store[1]!, platformId: 'p9' }]
    expect(
      readingsToImport(twice, [], ['weight'], ['io.github.pepcalc.app'], new Set(['p1'])).map(
        (r) => r.platformId,
      ),
    ).toEqual(['p2'])
  })
})

describe('readingsToExport', () => {
  it('sends new readings, and marks those another app already wrote as found', () => {
    const local = [weight('a', T, 80), weight('b', T + DAY, 79.6), weight('c', T + 2 * DAY, 79.4)]
    const { send, found } = readingsToExport(local, ['weight'], new Set(['a']), [
      { measure: 'weight', at: T + DAY + 10_000, value: 79.6 },
    ])
    expect(send.map((r) => r.id)).toEqual(['c'])
    expect(found.map((r) => r.id)).toEqual(['b'])
  })

  it('leaves out measures not chosen', () => {
    const hr: LocalReading = { id: 'h', measure: 'restingHeartRate', at: T, value: 60 }
    expect(readingsToExport([hr], ['weight'], new Set()).send).toEqual([])
  })
})

describe('windows and settings', () => {
  it('reads everything first, then from two days before the last sync', () => {
    expect(importStart(null)).toBe(0)
    expect(importStart(T)).toBe(T - 2 * DAY)
  })

  it('runs ongoing sync at most every ten minutes', () => {
    expect(syncDue(null, T)).toBe(true)
    expect(syncDue(T, T + 9 * MIN)).toBe(false)
    expect(syncDue(T, T + 10 * MIN)).toBe(true)
  })

  it('reads stored settings back safely, off by default', () => {
    expect(sanitizeHealthSync(undefined)).toEqual(DEFAULT_HEALTH_SYNC)
    expect(DEFAULT_HEALTH_SYNC.enabled).toBe(false)
    expect(
      sanitizeHealthSync({
        measures: ['weight', 'steps'],
        direction: 'sideways',
        schedule: 'once',
        enabled: true,
        lastSyncAt: 5,
        inHealth: ['a', 1],
        taken: [{ id: 'p', at: T }, { id: 2 }],
      }),
    ).toEqual({
      measures: ['weight'],
      direction: 'both',
      schedule: 'once',
      enabled: true,
      lastSyncAt: null,
      inHealth: ['a'],
      taken: [{ id: 'p', at: T }],
    })
  })
})
