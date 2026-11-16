import { describe, expect, it } from 'vitest'
import { shelfNotices, vialBalance, type VialBalance } from '@/domain/inventory'
import { splitBlendDose, blendTotalMg } from '@/domain/blend'

describe('vial balance', () => {
  const vial = { amount: 10, unit: 'mg' as const, diluentMl: 2 }

  it('subtracts draws in mixed mass units', () => {
    const b = vialBalance(
      vial,
      [
        { dose: { value: 2.5, unit: 'mg' }, volumeMl: 0.5 },
        { dose: { value: 2500, unit: 'mcg' }, volumeMl: 0.5 },
      ],
      { value: 2.5, unit: 'mg' },
    )
    expect(b.remainingAmount).toBeCloseTo(5, 9)
    expect(b.remainingMl).toBeCloseTo(1, 9)
    expect(b.usedFraction).toBeCloseTo(0.5, 9)
    expect(b.dosesLeft).toBe(2)
    expect(b.overdrawn).toBe(false)
  })

  it('never goes below zero and flags overdraw', () => {
    const b = vialBalance(vial, [{ dose: { value: 12, unit: 'mg' }, volumeMl: 2.4 }])
    expect(b.remainingAmount).toBe(0)
    expect(b.remainingMl).toBe(0)
    expect(b.overdrawn).toBe(true)
    expect(b.dosesLeft).toBeNull()
  })
})

describe('blends', () => {
  const klow = [
    { name: 'GHK-Cu', amountMg: 50, peptideId: 'ghk-cu' },
    { name: 'BPC-157', amountMg: 10, peptideId: 'bpc-157' },
    { name: 'TB-500', amountMg: 10, peptideId: 'tb-500' },
    { name: 'KPV', amountMg: 10, peptideId: 'kpv' },
  ]

  it('totals the components', () => {
    expect(blendTotalMg(klow)).toBe(80)
  })

  it('splits a dose in the vial ratio', () => {
    const split = splitBlendDose({ value: 8, unit: 'mg' }, klow, 'mcg')
    expect(split.map((s) => s.dose.value)).toEqual([5000, 1000, 1000, 1000])
    expect(split.every((s) => s.dose.unit === 'mcg')).toBe(true)
  })
})

describe('shelfNotices', () => {
  const okBalance = (dosesLeft: number | null, overdrawn = false): VialBalance => ({
    remainingAmount: overdrawn ? 0 : 1,
    remainingMl: overdrawn ? 0 : 1,
    usedFraction: overdrawn ? 1 : 0.5,
    dosesLeft,
    overdrawn,
  })

  it('flags 2 doses left, omits 3 doses left and null usual dose', () => {
    const notices = shelfNotices(
      [
        { id: 'v1', name: 'BPC-157', status: 'active' },
        { id: 'v2', name: 'Semaglutide', status: 'active' },
        { id: 'v3', name: 'Tirzepatide', status: 'active' },
      ],
      new Map([
        ['v1', okBalance(2)],
        ['v2', okBalance(3)],
        ['v3', okBalance(null)],
      ]),
      new Map(),
    )
    expect(notices.map((n) => n.text)).toEqual(['BPC-157: about 2 doses left.'])
  })

  it('flags nearing and past use windows, overdrawn vials, ignores archived, and orders by name', () => {
    const limits = { nearingDays: 21, pastDays: 28 }
    const notices = shelfNotices(
      [
        { id: 'z', name: 'Tirzepatide', status: 'active' },
        { id: 'a', name: 'BPC-157', status: 'active' },
        { id: 'm', name: 'Semaglutide', status: 'active' },
        { id: 'old', name: 'Archived', status: 'archived' },
      ],
      new Map([
        ['z', okBalance(0, true)],
        ['a', okBalance(5)],
        ['m', okBalance(5)],
        ['old', okBalance(1, true)],
      ]),
      new Map([
        ['a', { days: 24, tier: 'nearing', limits }],
        ['m', { days: 30, tier: 'past', limits }],
        ['old', { days: 40, tier: 'past', limits }],
      ]),
    )
    expect(notices.map((n) => [n.vialId, n.kind, n.text])).toEqual([
      ['a', 'age', 'BPC-157: Day 24 of 28 · use soon'],
      ['m', 'age', 'Semaglutide: Day 30 · 28-day limit reached'],
      ['z', 'overdrawn', 'Tirzepatide: draws exceed the vial.'],
    ])
  })
})
