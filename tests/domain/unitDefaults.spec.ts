import { describe, expect, it, vi } from 'vitest'
import {
  A1C_IFCC_REGIONS,
  LEGACY_UNITS,
  MMOL_GLUCOSE_REGIONS,
  hasMissingUnit,
  regionOf,
  resolveUnits,
  systemOf,
  unitDefaultsFor,
  type MeasurementSystem,
  type UnitDefaults,
} from '@/domain/unitDefaults'

describe('systemOf', () => {
  it('maps CLDR measurement system regions', () => {
    expect(systemOf('US')).toBe('us')
    expect(systemOf('LR')).toBe('us')
    expect(systemOf('GB')).toBe('uk')
    expect(systemOf('MM')).toBe('uk')
    expect(systemOf('DE')).toBe('metric')
    expect(systemOf(null)).toBe('metric')
  })
})

describe('unitDefaultsFor', () => {
  it.each<{
    region: string | null
    system: MeasurementSystem | null
    weight: UnitDefaults['weightUnit']
    height: UnitDefaults['heightUnit']
    glucose: UnitDefaults['glucoseUnit']
  }>([
    { region: 'US', system: null, weight: 'lb', height: 'ftin', glucose: 'mg/dL' },
    { region: 'US', system: 'us', weight: 'lb', height: 'ftin', glucose: 'mg/dL' },
    { region: 'US', system: 'metric', weight: 'kg', height: 'cm', glucose: 'mg/dL' },
    { region: 'GB', system: null, weight: 'kg', height: 'ftin', glucose: 'mmol/L' },
    { region: 'GB', system: 'uk', weight: 'kg', height: 'ftin', glucose: 'mmol/L' },
    { region: 'CA', system: null, weight: 'kg', height: 'ftin', glucose: 'mmol/L' },
    { region: 'IN', system: null, weight: 'kg', height: 'ftin', glucose: 'mg/dL' },
    { region: 'DE', system: null, weight: 'kg', height: 'cm', glucose: 'mg/dL' },
    { region: 'DE', system: 'us', weight: 'lb', height: 'ftin', glucose: 'mg/dL' },
    { region: 'AU', system: null, weight: 'kg', height: 'cm', glucose: 'mmol/L' },
    { region: 'HK', system: null, weight: 'lb', height: 'cm', glucose: 'mmol/L' },
    { region: 'LR', system: null, weight: 'kg', height: 'cm', glucose: 'mg/dL' },
    { region: 'MM', system: null, weight: 'kg', height: 'cm', glucose: 'mg/dL' },
    { region: null, system: 'us', weight: 'lb', height: 'ftin', glucose: 'mg/dL' },
    { region: null, system: null, weight: 'kg', height: 'cm', glucose: 'mg/dL' },
    { region: 'zz', system: null, weight: 'kg', height: 'cm', glucose: 'mg/dL' },
  ])('region $region, system $system -> $weight, $height, $glucose', (row) => {
    const defaults = unitDefaultsFor({ region: row.region, measurementSystem: row.system })
    expect(defaults.weightUnit).toBe(row.weight)
    expect(defaults.heightUnit).toBe(row.height)
    expect(defaults.glucoseUnit).toBe(row.glucose)
  })

  it('guards the CLDR mmol/L region set count and format', () => {
    expect(MMOL_GLUCOSE_REGIONS.size).toBe(68)
    for (const code of MMOL_GLUCOSE_REGIONS) {
      expect(code).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('uses mmol/mol only for cited IFCC-only regions', () => {
    for (const region of A1C_IFCC_REGIONS) {
      expect(unitDefaultsFor({ region, measurementSystem: null }).a1cUnit).toBe('mmol/mol')
    }
    for (const region of ['US', 'DE', 'CA', 'AU', null]) {
      expect(unitDefaultsFor({ region, measurementSystem: null }).a1cUnit).toBe('%')
    }
  })
})

describe('regionOf', () => {
  it('picks the first explicit region or falls back to likelyRegion', () => {
    expect(regionOf(['en-GB', 'en'], () => undefined)).toBe('GB')
    expect(regionOf(['en', 'de-DE'], () => 'US')).toBe('DE')
    expect(regionOf(['en'], () => 'US')).toBe('US')
    expect(regionOf(['en'], () => undefined)).toBeNull()
    expect(regionOf([], () => 'US')).toBeNull()
    expect(regionOf(['zh-Hant-HK'], () => undefined)).toBe('HK')
    expect(
      regionOf(['not a tag'], () => {
        throw new RangeError('Invalid language tag')
      }),
    ).toBeNull()
  })
})

describe('resolveUnits', () => {
  const US_DEFAULTS: UnitDefaults = {
    weightUnit: 'lb',
    heightUnit: 'ftin',
    glucoseUnit: 'mg/dL',
    a1cUnit: '%',
  }

  it('keeps stored valid units without calling detect or writing', () => {
    const detect = vi.fn(() => US_DEFAULTS)
    const stored: UnitDefaults = {
      weightUnit: 'lb',
      heightUnit: 'cm',
      glucoseUnit: 'mmol/L',
      a1cUnit: 'mmol/mol',
    }
    expect(resolveUnits(stored, false, detect)).toEqual({ units: stored, toStore: {} })
    expect(detect).not.toHaveBeenCalled()
  })

  it('writes LEGACY_UNITS on an existing install without calling detect', () => {
    const detect = vi.fn(() => US_DEFAULTS)
    expect(resolveUnits({}, true, detect)).toEqual({
      units: LEGACY_UNITS,
      toStore: LEGACY_UNITS,
    })
    expect(detect).not.toHaveBeenCalled()
  })

  it('calls detect once on a new install with nothing stored', () => {
    const detect = vi.fn(() => US_DEFAULTS)
    expect(resolveUnits({}, false, detect)).toEqual({
      units: US_DEFAULTS,
      toStore: US_DEFAULTS,
    })
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('fills only missing units on a new install', () => {
    const detect = vi.fn(() => US_DEFAULTS)
    expect(resolveUnits({ weightUnit: 'lb' }, false, detect)).toEqual({
      units: US_DEFAULTS,
      toStore: { heightUnit: 'ftin', glucoseUnit: 'mg/dL', a1cUnit: '%' },
    })
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('treats unknown stored values as missing', () => {
    const detect = vi.fn(() => US_DEFAULTS)
    expect(resolveUnits({ weightUnit: 'stone', heightUnit: 42 }, false, detect)).toEqual({
      units: US_DEFAULTS,
      toStore: US_DEFAULTS,
    })
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('reports whether any unit is missing or invalid', () => {
    expect(hasMissingUnit(LEGACY_UNITS)).toBe(false)
    expect(hasMissingUnit({ weightUnit: 'lb' })).toBe(true)
    expect(hasMissingUnit({ ...LEGACY_UNITS, weightUnit: 'stone' })).toBe(true)
  })
})
