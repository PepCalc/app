import { describe, expect, it } from 'vitest'
import { readSyringe, scaleLabel, scaleParts, suggestSyringe, syringeTicks } from '@/domain/syringe'
import { findSyringe, syringeCatalog } from '@/data'

describe('syringe readings', () => {
  const u100 = findSyringe('u100-1ml')

  it('reads 0.1 mL as 10 units on a U-100 syringe', () => {
    const r = readSyringe(0.1, u100)
    expect(r.scaleValue).toBeCloseTo(10, 9)
    expect(r.scaleUnit).toBe('units')
    expect(r.nearestTickValue).toBe(10)
    expect(r.fits).toBe(true)
    expect(r.belowResolution).toBe(false)
  })

  it('reads the same volume as 4 units on a U-40 syringe', () => {
    expect(readSyringe(0.1, findSyringe('u40-1ml')).scaleValue).toBeCloseTo(4, 9)
  })

  it('reads mL directly on a luer syringe', () => {
    const r = readSyringe(0.35, findSyringe('luer-1ml'))
    expect(r.scaleUnit).toBe('mL')
    expect(r.scaleValue).toBeCloseTo(0.35, 9)
  })

  it('rounds to the nearest 2-unit mark on a 1 mL U-100 syringe and reports the error', () => {
    const r = readSyringe(0.125, u100)
    expect(r.nearestTickValue).toBe(12)
    expect(r.tickRoundingError).toBeCloseTo(0.04, 6)
  })

  it('flags volumes over capacity and counts fills', () => {
    const r = readSyringe(1.5, u100)
    expect(r.fits).toBe(false)
    expect(r.fillsNeeded).toBe(2)
  })

  it('flags volumes smaller than one mark', () => {
    expect(readSyringe(0.01, u100).belowResolution).toBe(true)
  })

  it('suggests the smallest barrel that fits', () => {
    const insulin = syringeCatalog.syringes.filter((s) => s.unitsPerMl === 100)
    expect(suggestSyringe(0.1, insulin)?.id).toBe('u100-0.3ml')
    expect(suggestSyringe(0.45, insulin)?.id).toBe('u100-0.5ml')
    expect(suggestSyringe(2, insulin)).toBeNull()
  })
})

describe('syringe graduations', () => {
  it('numbers every fifth mark on a 30-unit syringe', () => {
    const ticks = syringeTicks(findSyringe('u100-0.3ml'))
    expect(ticks).toHaveLength(31)
    expect(ticks[0]).toEqual({ at: 0, kind: 'major', label: '0' })
    expect(ticks.at(-1)).toEqual({ at: 1, kind: 'major', label: '30' })
    expect(ticks.filter((t) => t.label !== null).map((t) => t.label)).toEqual([
      '0',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
    ])
  })

  it('adds a medium mark halfway between numbers when that falls on a tick', () => {
    const ticks = syringeTicks(findSyringe('u100-0.3ml-half'))
    expect(ticks).toHaveLength(61)
    expect(ticks[5]!.kind).toBe('half')
    expect(ticks[10]).toMatchObject({ kind: 'major', label: '5' })
    expect(ticks[1]!.kind).toBe('minor')
  })

  it('labels mL syringes in mL', () => {
    const labels = syringeTicks(findSyringe('luer-1ml'))
      .filter((t) => t.label !== null)
      .map((t) => t.label)
    expect(labels.slice(0, 3)).toEqual(['0', '0.1', '0.2'])
    expect(labels.at(-1)).toBe('1')
  })
})

describe('scale readings for display', () => {
  it('splits a reading into the number and the scale it is read in', () => {
    expect(scaleParts(readSyringe(0.125, findSyringe('u100-1ml')))).toEqual({
      value: 12.5,
      unit: 'units',
    })
    expect(scaleParts(readSyringe(0.1254, findSyringe('luer-1ml')))).toEqual({
      value: 0.125,
      unit: 'mL',
    })
    expect(scaleLabel(readSyringe(0.125, findSyringe('u100-1ml')))).toBe('12.5 units')
  })
})
