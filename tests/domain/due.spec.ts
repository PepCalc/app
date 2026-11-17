import { describe, expect, it } from 'vitest'
import { dueToneFor, sortDue, type DueItem } from '@/domain/due'

const item = (id: string, title: string, dueAt: number | null): DueItem => ({
  id,
  title,
  detail: dueAt === null ? 'No doses yet' : 'Last: 5 mg, today',
  dueAt,
})

describe('sortDue', () => {
  it('sorts soonest first, with late items before future ones', () => {
    const sorted = sortDue([
      item('future', 'Wegovy', 2_000),
      item('late', 'Zepbound', 500),
      item('soon', 'Rybelsus', 1_000),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['late', 'soon', 'future'])
  })

  it('places null due times last, sorted by title', () => {
    const sorted = sortDue([
      item('b', 'Zepbound', null),
      item('c', 'Mounjaro', 1_000),
      item('a', 'Ozempic', null),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('is stable when due times are equal', () => {
    const sorted = sortDue([
      item('first', 'Zepbound', 1_000),
      item('second', 'Mounjaro', 1_000),
      item('third', 'Wegovy', 1_000),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third'])
  })
})

describe('dueToneFor', () => {
  it('maps schedule states to calm badge tones', () => {
    expect(dueToneFor('late')).toBe('alert')
    expect(dueToneFor('due')).toBe('notice')
    expect(dueToneFor('soon')).toBe('brand')
    expect(dueToneFor('minutes')).toBe('brand')
    expect(dueToneFor('later')).toBe('muted')
  })
})
