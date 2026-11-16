import { describe, expect, it } from 'vitest'
import { countByKind, ENTRY_KINDS, filterEntries, groupByDay, type Entry } from '@/domain/entries'

const DAY_MS = 86_400_000
const utcDayStart = (at: number) => Math.floor(at / DAY_MS) * DAY_MS

const entry = (overrides: Partial<Entry> & Pick<Entry, 'id' | 'kind' | 'at'>): Entry => ({
  title: overrides.id,
  detail: '',
  notes: '',
  ...overrides,
})

describe('filterEntries', () => {
  const entries = [
    entry({ id: 'd1', kind: 'dose', at: 1000 }),
    entry({ id: 'w1', kind: 'weight', at: 2000 }),
    entry({ id: 's1', kind: 'symptom', at: 3000 }),
  ]

  it('returns everything when kinds is empty', () => {
    expect(filterEntries(entries, new Set())).toEqual(entries)
  })

  it('returns only matching kinds when non-empty', () => {
    expect(filterEntries(entries, new Set(['weight'])).map((e) => e.id)).toEqual(['w1'])
  })
})

describe('groupByDay', () => {
  it('places entries either side of UTC midnight into separate day groups', () => {
    const midnight = Date.UTC(2026, 10, 16, 0, 0, 0)
    const before = entry({ id: 'before', kind: 'weight', at: midnight - 1 })
    const after = entry({ id: 'after', kind: 'dose', at: midnight + 1 })

    const groups = groupByDay([before, after], utcDayStart, 'desc')
    expect(groups).toEqual([
      { day: midnight, entries: [after] },
      { day: midnight - DAY_MS, entries: [before] },
    ])
  })

  it('orders days and entries descending or ascending', () => {
    const day1 = Date.UTC(2026, 10, 15, 0, 0, 0)
    const day2 = Date.UTC(2026, 10, 16, 0, 0, 0)
    const e1 = entry({ id: 'e1', kind: 'weight', at: day1 + 1000 })
    const e2 = entry({ id: 'e2', kind: 'dose', at: day2 + 1000 })
    const e3 = entry({ id: 'e3', kind: 'vital', at: day2 + 2000 })

    expect(groupByDay([e1, e2, e3], utcDayStart, 'desc')).toEqual([
      { day: day2, entries: [e3, e2] },
      { day: day1, entries: [e1] },
    ])
    expect(groupByDay([e1, e2, e3], utcDayStart, 'asc')).toEqual([
      { day: day1, entries: [e1] },
      { day: day2, entries: [e2, e3] },
    ])
  })

  it('preserves input order for entries at the same instant', () => {
    const at = Date.UTC(2026, 10, 16, 8, 0, 0)
    const first = entry({ id: 'first', kind: 'dose', at })
    const second = entry({ id: 'second', kind: 'weight', at })

    expect(groupByDay([first, second], utcDayStart, 'desc')[0]!.entries.map((e) => e.id)).toEqual([
      'first',
      'second',
    ])
    expect(groupByDay([first, second], utcDayStart, 'asc')[0]!.entries.map((e) => e.id)).toEqual([
      'first',
      'second',
    ])
  })
})

describe('countByKind', () => {
  it('counts every kind and returns zero for kinds with none', () => {
    const counts = countByKind([
      entry({ id: 'd1', kind: 'dose', at: 1 }),
      entry({ id: 'd2', kind: 'dose', at: 2 }),
      entry({ id: 'w1', kind: 'weight', at: 3 }),
    ])
    expect(Object.keys(counts)).toEqual([...ENTRY_KINDS])
    expect(counts).toEqual({
      dose: 2,
      weight: 1,
      symptom: 0,
      glucose: 0,
      vital: 0,
      photo: 0,
    })
  })
})
