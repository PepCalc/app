import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLevelPickStore } from '@/stores/levelPick'

describe('levelPick', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the newest peptides until the user picks', () => {
    const pick = useLevelPickStore()
    expect(pick.picked(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps a pick across screens that list different peptides', () => {
    const pick = useLevelPickStore()
    pick.choose(['c', 'a'])
    expect(pick.picked(['a', 'b', 'c'])).toEqual(['c', 'a'])
    // A screen without the picked ones falls back to its newest.
    expect(pick.picked(['x', 'y'])).toEqual(['x', 'y'])
  })

  it('keeps an empty pick empty', () => {
    const pick = useLevelPickStore()
    pick.choose([])
    expect(pick.picked(['a'])).toEqual([])
  })

  it('gives the weight line’s colour last, and keeps a peptide’s colour', () => {
    const pick = useLevelPickStore()
    pick.assign(['a', 'b'])
    expect(pick.slots.get('a')).toBe(1)
    pick.assign(['b', 'c'])
    expect(pick.slots.get('b')).toBe(2)
    expect(pick.slots.get('c')).toBe(1)
  })
})
