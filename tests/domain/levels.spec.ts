import { describe, expect, it } from 'vitest'
import {
  groupLevelsByPeptide,
  levelKey,
  levelsCaption,
  pooledDoses,
  startingDose,
  type LevelVial,
} from '@/domain/levels'
import { anyDoseInEffect } from '@/domain/pk'

const H = 3_600_000
const SEMA = { params: { halfLifeHours: 168, tmaxHours: 56 }, userSupplied: false }

const vial = (id: string, peptideId: string | null, extra: Partial<LevelVial> = {}): LevelVial => ({
  id,
  peptideId,
  label: peptideId ?? id,
  pk: null,
  ...extra,
})

describe('groupLevelsByPeptide', () => {
  it('pools draws of one peptide across vials, oldest first, in the latest unit', () => {
    const groups = groupLevelsByPeptide(
      [vial('a', 'semaglutide', { pk: SEMA }), vial('b', 'semaglutide', { pk: SEMA })],
      [
        { vialId: 'b', at: 3 * H, dose: { value: 500, unit: 'mcg' } },
        { vialId: 'a', at: 1 * H, dose: { value: 0.25, unit: 'mg' } },
      ],
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: 'semaglutide',
      unit: 'mcg',
      vialCount: 2,
      excluded: 0,
      latestAt: 3 * H,
      doses: [
        { at: 1 * H, amount: 250 },
        { at: 3 * H, amount: 500 },
      ],
    })
  })

  it('keeps each custom vial separate and orders groups newest first', () => {
    const groups = groupLevelsByPeptide(
      [vial('x', null), vial('y', null)],
      [
        { vialId: 'x', at: 1 * H, dose: { value: 1, unit: 'mg' } },
        { vialId: 'y', at: 2 * H, dose: { value: 1, unit: 'mg' } },
      ],
    )
    expect(groups.map((g) => g.key)).toEqual(['vial:y', 'vial:x'])
  })

  it('uses the PK parameters of the most recently drawn vial', () => {
    const own = { params: { halfLifeHours: 100, tmaxHours: 20 }, userSupplied: true }
    const groups = groupLevelsByPeptide(
      [vial('a', 'semaglutide', { pk: SEMA }), vial('b', 'semaglutide', { pk: own })],
      [
        { vialId: 'a', at: 2 * H, dose: { value: 1, unit: 'mg' } },
        { vialId: 'b', at: 1 * H, dose: { value: 1, unit: 'mg' } },
      ],
    )
    expect(groups[0]?.pk).toBe(SEMA)
  })

  it('leaves out draws that cannot share the latest unit instead of converting IU to mass', () => {
    const groups = groupLevelsByPeptide(
      [vial('a', 'hgh')],
      [
        { vialId: 'a', at: 1 * H, dose: { value: 1, unit: 'mg' } },
        { vialId: 'a', at: 2 * H, dose: { value: 2, unit: 'iu' } },
      ],
    )
    expect(groups[0]).toMatchObject({ unit: 'iu', excluded: 1, doses: [{ at: 2 * H, amount: 2 }] })
  })

  it('skips draws whose vial was deleted', () => {
    expect(
      groupLevelsByPeptide([], [{ vialId: 'gone', at: 0, dose: { value: 1, unit: 'mg' } }]),
    ).toEqual([])
  })
})

describe('anyDoseInEffect', () => {
  const params = SEMA.params

  it('is true shortly after a dose and false long after it has cleared', () => {
    const doses = [{ at: 0, amount: 1 }]
    expect(anyDoseInEffect(doses, params, 7 * 24 * H)).toBe(true)
    expect(anyDoseInEffect(doses, params, 365 * 24 * H)).toBe(false)
  })

  it('is false with no doses', () => {
    expect(anyDoseInEffect([], params, 0)).toBe(false)
  })
})

describe('pooledDoses', () => {
  it('keeps this vial’s mass doses when another vial’s latest draw is in IU', () => {
    const vials = [vial('a', 'hgh'), vial('b', 'hgh')]
    const { doses, vialCount } = pooledDoses(
      vials,
      [
        { vialId: 'a', at: 1 * H, dose: { value: 1, unit: 'mg' } },
        { vialId: 'a', at: 2 * H, dose: { value: 500, unit: 'mcg' } },
        { vialId: 'b', at: 3 * H, dose: { value: 2, unit: 'iu' } },
      ],
      levelKey(vials[0]!),
      'mg',
    )
    expect(doses).toEqual([
      { at: 1 * H, amount: 1 },
      { at: 2 * H, amount: 0.5 },
    ])
    expect(vialCount).toBe(1)
  })

  it('pools only the custom vial itself', () => {
    const vials = [vial('x', null), vial('y', null)]
    const draws = [
      { vialId: 'x', at: 1 * H, dose: { value: 1, unit: 'mg' as const } },
      { vialId: 'y', at: 2 * H, dose: { value: 1, unit: 'mg' as const } },
    ]
    expect(pooledDoses(vials, draws, levelKey(vials[0]!), 'mg').doses).toHaveLength(1)
  })
})

describe('startingDose', () => {
  const shelf = [
    { id: 'a', peptideId: 'bpc-157' },
    { id: 'b', peptideId: 'bpc-157' },
    { id: 'c', peptideId: null },
  ]
  const target = (extra: Partial<Parameters<typeof startingDose>[0]> = {}) => ({
    id: 'b',
    peptideId: 'bpc-157',
    unit: 'mg' as const,
    typicalDose: null,
    ...extra,
  })
  const draw = (vialId: string, at: number, value: number, unit: 'mg' | 'mcg' | 'iu' = 'mcg') => ({
    vialId,
    at,
    dose: { value, unit },
  })

  it('prefers the latest draw from this vial, whatever order draws arrive in', () => {
    const draws = [draw('b', 1 * H, 250), draw('b', 3 * H, 300), draw('a', 5 * H, 500)]
    const start = startingDose(target({ typicalDose: { value: 0.1, unit: 'mg' } }), shelf, draws)
    expect(start).toEqual({ kind: 'this-vial', draw: draws[1] })
  })

  it("falls back to the vial's usual dose before another vial's draws", () => {
    const usual = { value: 0.25, unit: 'mg' as const }
    expect(startingDose(target({ typicalDose: usual }), shelf, [draw('a', H, 500)])).toEqual({
      kind: 'usual',
      dose: usual,
    })
  })

  it('continues from the same peptide in another vial when this one has no draws or usual dose', () => {
    const draws = [draw('a', 1 * H, 250), draw('a', 2 * H, 300), draw('c', 9 * H, 1, 'mg')]
    expect(startingDose(target(), shelf, draws)).toEqual({ kind: 'other-vial', draw: draws[1] })
  })

  it('skips draws in a unit this vial cannot measure', () => {
    const draws = [draw('b', 2 * H, 5, 'iu'), draw('b', 1 * H, 250)]
    expect(startingDose(target(), shelf, draws)).toEqual({ kind: 'this-vial', draw: draws[1] })
  })

  it('never pools custom peptides with each other', () => {
    const custom = target({ id: 'c', peptideId: null })
    const vials = [...shelf, { id: 'd', peptideId: null }]
    expect(startingDose(custom, vials, [draw('d', H, 1, 'mg')])).toBeNull()
  })
})

describe('levelsCaption', () => {
  it('formats one dose from one vial, several from two, and excluded draws', () => {
    expect(levelsCaption({ doses: [{ at: 0, amount: 1 }], vialCount: 1, excluded: 0 }, 'mg')).toBe(
      '1 logged dose from 1 vial.',
    )
    expect(
      levelsCaption(
        {
          doses: [
            { at: 0, amount: 1 },
            { at: H, amount: 2 },
          ],
          vialCount: 2,
          excluded: 0,
        },
        'mg',
      ),
    ).toBe('2 logged doses from 2 vials.')
    expect(levelsCaption({ doses: [{ at: 0, amount: 2 }], vialCount: 1, excluded: 1 }, 'IU')).toBe(
      "1 logged dose from 1 vial. Excludes 1 draw that can't be converted to IU.",
    )
  })
})
