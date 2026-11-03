import { describe, expect, it } from 'vitest'
import {
  dueState,
  intervalText,
  lastDrawFor,
  nextDueAt,
  protocolFollowingRename,
  remainingFraction,
} from '@/domain/schedule'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H

describe('nextDueAt', () => {
  it('adds the interval to the last draw', () => {
    expect(nextDueAt(0, 168)).toBe(7 * DAY)
    expect(nextDueAt(0, 12)).toBe(12 * H)
    expect(nextDueAt(null, 24)).toBeNull()
    expect(nextDueAt(0, 0)).toBeNull()
  })
})

describe('dueState', () => {
  it('reads days ahead, then hours, then quarter hours rounding up', () => {
    expect(dueState(3 * DAY, 168, 0)).toEqual({ kind: 'later', days: 3 })
    expect(dueState(DAY, 168, 0)).toEqual({ kind: 'later', days: 1 })
    expect(dueState(DAY - 1, 168, 0)).toEqual({ kind: 'soon', hours: 23 })
    expect(dueState(89 * MIN, 168, 0)).toEqual({ kind: 'soon', hours: 1 })
    expect(dueState(46 * MIN, 168, 0)).toEqual({ kind: 'soon', hours: 1 })
    expect(dueState(45 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 45 })
    expect(dueState(31 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 45 })
    expect(dueState(30 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 30 })
    expect(dueState(16 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 30 })
    expect(dueState(15 * MIN, 168, 0)).toEqual({ kind: 'minutes', minutes: 15 })
    expect(dueState(1, 168, 0)).toEqual({ kind: 'minutes', minutes: 15 })
  })

  it('is due for a day after, or one interval when shorter, then late', () => {
    expect(dueState(0, 168, 0)).toEqual({ kind: 'due' })
    expect(dueState(0, 168, 20 * H)).toEqual({ kind: 'due' })
    expect(dueState(0, 168, 2.5 * DAY)).toEqual({ kind: 'late', days: 2 })
    expect(dueState(0, 12, 11 * H)).toEqual({ kind: 'due' })
    expect(dueState(0, 12, 13 * H)).toEqual({ kind: 'late', days: 1 })
  })
})

describe('remainingFraction', () => {
  it('drains over the interval while days remain', () => {
    expect(remainingFraction(7 * DAY, 168, 0)).toBe(1)
    expect(remainingFraction(7 * DAY, 168, 3.5 * DAY)).toBeCloseTo(0.5, 12)
  })

  it('zooms to the last day, then the last hour', () => {
    expect(remainingFraction(7 * DAY, 168, 6 * DAY + 1)).toBeCloseTo(1, 6)
    expect(remainingFraction(7 * DAY, 168, 7 * DAY - 12 * H)).toBeCloseTo(0.5, 12)
    expect(remainingFraction(7 * DAY, 168, 7 * DAY - 30 * MIN)).toBeCloseTo(0.5, 12)
  })

  it('starts full for an interval shorter than a day', () => {
    expect(remainingFraction(12 * H, 12, 0)).toBe(1)
    expect(remainingFraction(12 * H, 12, 6 * H)).toBeCloseTo(0.5, 12)
  })

  it('stays at 0 once due', () => {
    expect(remainingFraction(0, 24, 0)).toBe(0)
    expect(remainingFraction(0, 24, 5 * H)).toBe(0)
    expect(remainingFraction(DAY, 0, 0)).toBe(0)
  })
})

describe('intervalText', () => {
  it('names common intervals and spells out the rest', () => {
    expect(intervalText(12)).toBe('twice daily')
    expect(intervalText(24)).toBe('daily')
    expect(intervalText(48)).toBe('every 2 days')
    expect(intervalText(168)).toBe('weekly')
    expect(intervalText(8)).toBe('every 8 hours')
  })
})

describe('protocolFollowingRename', () => {
  const protocols = [{ id: 'p1', key: 'name:my peptide' }]

  it('moves the protocol when the renamed vial was the last one of its name', () => {
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', [], protocols)).toBe('p1')
  })

  it('stays with vials that still have the old name', () => {
    const others = [{ peptideId: null, name: 'My Peptide' }]
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', others, protocols)).toBeNull()
  })

  it('never replaces a protocol the new name already has', () => {
    const both = [...protocols, { id: 'p2', key: 'name:my pep' }]
    expect(protocolFollowingRename('name:my peptide', 'name:my pep', [], both)).toBeNull()
  })

  it('does nothing when the product is unchanged or has no protocol', () => {
    expect(protocolFollowingRename('name:a', 'name:a', [], protocols)).toBeNull()
    expect(protocolFollowingRename('name:b', 'name:c', [], protocols)).toBeNull()
  })
})

describe('lastDrawFor', () => {
  const vials = [
    { id: 'a', peptideId: 'bpc-157', name: 'BPC-157' },
    { id: 'b', peptideId: 'bpc-157', name: 'BPC-157' },
    { id: 'c', peptideId: null, name: 'My Peptide' },
    { id: 'd', peptideId: null, name: ' my peptide ' },
    { id: 'e', peptideId: 'wolverine', name: 'Wolverine blend' },
  ]
  const draws = [
    { id: '5', vialId: 'e' },
    { id: '4', vialId: 'd' },
    { id: '3', vialId: 'b' },
    { id: '2', vialId: 'c' },
    { id: '1', vialId: 'a' },
  ]

  it('takes the newest draw across every vial of a catalog peptide', () => {
    expect(lastDrawFor('bpc-157', vials, draws)?.id).toBe('3')
  })

  it('matches custom peptides by name, ignoring case and spaces', () => {
    expect(lastDrawFor('name:my peptide', vials, draws)?.id).toBe('4')
  })

  it('keeps a blend as its own product', () => {
    expect(lastDrawFor('wolverine', vials, draws)?.id).toBe('5')
    expect(lastDrawFor('bpc-157', vials, draws.slice(0, 1))).toBeNull()
  })

  it('is null when no vial matches', () => {
    expect(lastDrawFor('tb-500', vials, draws)).toBeNull()
  })
})
