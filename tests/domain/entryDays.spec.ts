import { describe, expect, it } from 'vitest'
import type { Entry, EntryKind } from '@/domain/entries'
import { dayMarkText, entriesOn, markDays, withScheduled } from '@/domain/entryDays'

const DAY_MS = 86_400_000
const utcDayStart = (at: number) => Math.floor(at / DAY_MS) * DAY_MS

const PLURALS: Record<EntryKind, [string, string]> = {
  dose: ['dose', 'doses'],
  weight: ['weigh-in', 'weigh-ins'],
  symptom: ['side effect', 'side effects'],
  glucose: ['blood sugar reading', 'blood sugar readings'],
  vital: ['vital', 'vitals'],
  photo: ['photo', 'photos'],
}

function makeEntry(id: string, kind: EntryKind, at: number): Entry {
  return { id, kind, at, title: id, detail: '', notes: '' }
}

describe('entryDays', () => {
  it('1. returns an empty map when there are no entries', () => {
    expect(markDays([], utcDayStart).size).toBe(0)
  })

  it('2. counts three entries on one day across two kinds in one mark', () => {
    const d = Date.UTC(2026, 10, 16)
    const entries = [
      makeEntry('d1', 'dose', d + 8 * 3_600_000),
      makeEntry('w1', 'weight', d + 7 * 3_600_000),
      makeEntry('w2', 'weight', d + 19 * 3_600_000),
    ]
    const marks = markDays(entries, utcDayStart)
    expect(marks.size).toBe(1)
    expect(marks.get(d)).toEqual({
      day: d,
      counts: { dose: 1, weight: 2 },
      scheduled: false,
    })
  })

  it('3. puts entries at 23:59 and 00:01 on adjacent days into two marks', () => {
    const day1 = Date.UTC(2026, 10, 16)
    const day2 = Date.UTC(2026, 10, 17)
    const entries = [
      makeEntry('e1', 'weight', day1 + 23 * 3_600_000 + 59 * 60_000),
      makeEntry('e2', 'weight', day2 + 60_000),
    ]
    const marks = markDays(entries, utcDayStart)
    expect(marks.size).toBe(2)
    expect(marks.get(day1)?.counts.weight).toBe(1)
    expect(marks.get(day2)?.counts.weight).toBe(1)
  })

  it('4. withScheduled adds a scheduled mark with empty counts on an empty day', () => {
    const d = Date.UTC(2026, 10, 18)
    const marks = withScheduled(new Map(), [d + 8 * 3_600_000], utcDayStart)
    expect(marks.get(d)).toEqual({ day: d, counts: {}, scheduled: true })
  })

  it('5. withScheduled leaves scheduled false when a dose is already logged that day', () => {
    const d = Date.UTC(2026, 10, 16)
    const logged = markDays([makeEntry('d1', 'dose', d + 8 * 3_600_000)], utcDayStart)
    const marks = withScheduled(logged, [d + 20 * 3_600_000], utcDayStart)
    expect(marks.get(d)?.scheduled).toBe(false)
    expect(marks.get(d)?.counts.dose).toBe(1)
  })

  it('6. withScheduled marks scheduled true while preserving a logged weigh-in', () => {
    const d = Date.UTC(2026, 10, 16)
    const logged = markDays([makeEntry('w1', 'weight', d + 7 * 3_600_000)], utcDayStart)
    const marks = withScheduled(logged, [d + 8 * 3_600_000], utcDayStart)
    expect(marks.get(d)).toEqual({
      day: d,
      counts: { weight: 1 },
      scheduled: true,
    })
  })

  it('7. withScheduled does not mutate its input map', () => {
    const d = Date.UTC(2026, 10, 16)
    const logged = markDays([makeEntry('w1', 'weight', d + 7 * 3_600_000)], utcDayStart)
    const next = withScheduled(logged, [d + 8 * 3_600_000, d + DAY_MS], utcDayStart)
    expect(logged.size).toBe(1)
    expect(logged.get(d)?.scheduled).toBe(false)
    expect(next.size).toBe(2)
  })

  it('8. entriesOn returns only that day entries, earliest first', () => {
    const d1 = Date.UTC(2026, 10, 16)
    const d2 = Date.UTC(2026, 10, 17)
    const eLate = makeEntry('late', 'dose', d1 + 20 * 3_600_000)
    const eEarly = makeEntry('early', 'weight', d1 + 7 * 3_600_000)
    const eOther = makeEntry('other', 'weight', d2 + 8 * 3_600_000)
    const result = entriesOn([eLate, eOther, eEarly], d1, utcDayStart)
    expect(result.map((e) => e.id)).toEqual(['early', 'late'])
  })

  it('9. dayMarkText formats counts with singular and plural labels', () => {
    const d = Date.UTC(2026, 10, 16)
    expect(dayMarkText({ day: d, counts: { dose: 1, weight: 2 }, scheduled: false }, PLURALS)).toBe(
      '1 dose, 2 weigh-ins',
    )
  })

  it('10. dayMarkText formats a scheduled-only day', () => {
    const d = Date.UTC(2026, 10, 18)
    expect(dayMarkText({ day: d, counts: {}, scheduled: true }, PLURALS)).toBe('dose scheduled')
  })

  it('11. markDays handles 5,000 entries in one pass', () => {
    const start = Date.UTC(2026, 0, 1)
    const entries = Array.from({ length: 5000 }, (_, i) =>
      makeEntry(`e${i}`, 'weight', start + Math.floor(i / 5) * DAY_MS + (i % 5) * 3_600_000),
    )
    const marks = markDays(entries, utcDayStart)
    expect(marks.size).toBe(1000)
  })
})
