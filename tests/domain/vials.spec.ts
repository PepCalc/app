import { describe, expect, it } from 'vitest'
import { sameProductKey, vialNumbers } from '@/domain/vials'

describe('vialNumbers', () => {
  const vial = (id: string, peptideId: string | null, name: string, createdAt: number) => ({
    id,
    peptideId,
    name,
    createdAt,
  })

  it('numbers vials of the same peptide in the order they were added', () => {
    const n = vialNumbers([
      vial('new', 'bpc-157', 'BPC-157', 300),
      vial('old', 'bpc-157', 'BPC-157', 100),
      vial('sema', 'semaglutide', 'Semaglutide', 200),
    ])
    expect(n.get('old')).toBe(1)
    expect(n.get('new')).toBe(2)
    expect(n.has('sema')).toBe(false)
  })

  it('groups custom peptides by name regardless of case and spacing', () => {
    const n = vialNumbers([vial('a', null, 'MOTS-c', 1), vial('b', null, ' mots-c ', 2)])
    expect([n.get('a'), n.get('b')]).toEqual([1, 2])
  })

  it('never groups a custom peptide with a catalog one of the same name', () => {
    expect(sameProductKey({ peptideId: null, name: 'bpc-157' })).not.toBe(
      sameProductKey({ peptideId: 'bpc-157', name: 'BPC-157' }),
    )
  })
})
