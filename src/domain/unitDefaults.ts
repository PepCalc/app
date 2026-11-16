import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from './bodyUnits'
import { A1C_UNITS, GLUCOSE_UNITS, type A1cUnit, type GlucoseUnit } from './glucose'

export type MeasurementSystem = 'metric' | 'us' | 'uk'

/** What the device says about where and how its owner measures. Either part may be unknown. */
export interface RegionalPreferences {
  /** ISO 3166-1 alpha-2, upper case, or null. */
  region: string | null
  /** The device's measurement setting when the platform exposes one, else null. */
  measurementSystem: MeasurementSystem | null
}

export interface UnitDefaults {
  weightUnit: WeightUnit
  heightUnit: HeightUnit
  glucoseUnit: GlucoseUnit
  a1cUnit: A1cUnit
}

/** What the apps used for everyone before they read the region; existing installs keep it. */
export const LEGACY_UNITS: UnitDefaults = {
  weightUnit: 'kg',
  heightUnit: 'cm',
  glucoseUnit: 'mg/dL',
  a1cUnit: '%',
}

/*
 * Source: Unicode CLDR 49 (2026-11-16), supplemental/measurementData.json and
 * supplemental/unitPreferenceData.json:
 * https://github.com/unicode-org/cldr-json/tree/main/cldr-json/cldr-core/supplemental
 */
const US_SYSTEM_REGIONS = new Set(['US', 'LR'])
const UK_SYSTEM_REGIONS = new Set(['GB', 'MM'])

/** CLDR mass, usage `person`: pound (GB is stone and pound, omitted because stone is unsupported). */
const POUND_PERSON_REGIONS = new Set(['US', 'HK'])

/** CLDR length, usage `person-height`: foot and inch. */
const FTIN_HEIGHT_REGIONS = new Set(['CA', 'GB', 'IN', 'US'])

/** CLDR concentration, usage `blood-glucose`: mmol/L (68 regions; default is mg/dL). */
export const MMOL_GLUCOSE_REGIONS = new Set([
  'AG',
  'AI',
  'AO',
  'AU',
  'BA',
  'BG',
  'BH',
  'BM',
  'BN',
  'BW',
  'BY',
  'CA',
  'CH',
  'CM',
  'CN',
  'CZ',
  'DK',
  'DM',
  'EE',
  'FI',
  'FJ',
  'GB',
  'GD',
  'HK',
  'HR',
  'HU',
  'IE',
  'IM',
  'IS',
  'KE',
  'KN',
  'KW',
  'KZ',
  'LC',
  'LI',
  'LT',
  'LU',
  'LV',
  'ME',
  'MG',
  'MK',
  'MO',
  'MS',
  'MT',
  'MU',
  'MY',
  'MZ',
  'NA',
  'NL',
  'NO',
  'NZ',
  'OM',
  'PG',
  'RS',
  'RU',
  'SE',
  'SG',
  'SI',
  'SK',
  'TC',
  'TO',
  'UA',
  'UG',
  'VC',
  'VG',
  'VN',
  'VU',
  'ZA',
])

/**
 * Regions whose national laboratory standard reports HbA1c exclusively in IFCC mmol/mol.
 * - GB: NHS laboratories ended dual reporting on 1 October 2011 (https://pubmed.ncbi.nlm.nih.gov/22957983/)
 * - NZ: New Zealand laboratories ended dual reporting on 1 October 2011 (https://pubmed.ncbi.nlm.nih.gov/23178606/)
 */
export const A1C_IFCC_REGIONS = new Set(['GB', 'NZ'])

/** The measurement system CLDR assigns a region. */
export function systemOf(region: string | null): MeasurementSystem {
  const code = region?.toUpperCase()
  if (!code) return 'metric'
  if (US_SYSTEM_REGIONS.has(code)) return 'us'
  if (UK_SYSTEM_REGIONS.has(code)) return 'uk'
  return 'metric'
}

/** Display units for a new install. */
export function unitDefaultsFor(prefs: RegionalPreferences): UnitDefaults {
  const region = prefs.region ? prefs.region.toUpperCase() : null
  if (region === null && prefs.measurementSystem === null) return { ...LEGACY_UNITS }

  const regionSystem = systemOf(region)
  const system = prefs.measurementSystem ?? regionSystem
  // When the device setting agrees with the region (or isn't exposed), the region's own customs apply.
  const regional = system === regionSystem

  const weightUnit: WeightUnit = regional
    ? region && POUND_PERSON_REGIONS.has(region)
      ? 'lb'
      : 'kg'
    : system === 'us'
      ? 'lb'
      : 'kg'

  const heightUnit: HeightUnit = regional
    ? region && FTIN_HEIGHT_REGIONS.has(region)
      ? 'ftin'
      : 'cm'
    : system === 'metric'
      ? 'cm'
      : 'ftin'

  const glucoseUnit: GlucoseUnit = region && MMOL_GLUCOSE_REGIONS.has(region) ? 'mmol/L' : 'mg/dL'

  const a1cUnit: A1cUnit = region && A1C_IFCC_REGIONS.has(region) ? 'mmol/mol' : '%'

  return { weightUnit, heightUnit, glucoseUnit, a1cUnit }
}

/** Pulls an explicit two-letter region subtag from a BCP 47 tag, ignoring extension singletons. */
function explicitRegion(tag: string): string | null {
  const parts = tag.trim().split('-')
  if (parts.length < 2 || !/^[A-Za-z]{2,8}$/.test(parts[0]!)) return null
  for (const part of parts.slice(1)) {
    if (!/^[A-Za-z0-9]+$/.test(part)) return null
    if (part.length === 1) break
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
  }
  return null
}

/**
 * The region of the first tag that names one, else the likely region of the first tag.
 * `likelyRegion` is injected because likely-subtag data lives in `Intl`, outside the domain.
 */
export function regionOf(
  tags: readonly string[],
  likelyRegion: (tag: string) => string | undefined,
): string | null {
  if (!tags.length) return null
  for (const tag of tags) {
    const region = explicitRegion(tag)
    if (region) return region
  }
  try {
    const guessed = likelyRegion(tags[0]!)
    return guessed ? guessed.toUpperCase() : null
  } catch {
    return null
  }
}

function isValidUnit<K extends keyof UnitDefaults>(
  key: K,
  value: unknown,
): value is UnitDefaults[K] {
  if (typeof value !== 'string') return false
  switch (key) {
    case 'weightUnit':
      return WEIGHT_UNITS.includes(value as WeightUnit)
    case 'heightUnit':
      return HEIGHT_UNITS.includes(value as HeightUnit)
    case 'glucoseUnit':
      return GLUCOSE_UNITS.includes(value as GlucoseUnit)
    case 'a1cUnit':
      return A1C_UNITS.includes(value as A1cUnit)
  }
}

const UNIT_KEYS: readonly (keyof UnitDefaults)[] = [
  'weightUnit',
  'heightUnit',
  'glucoseUnit',
  'a1cUnit',
]

/** True when at least one unit key is absent or invalid, so a new install should detect defaults. */
export function hasMissingUnit(stored: Partial<Record<keyof UnitDefaults, unknown>>): boolean {
  return UNIT_KEYS.some((key) => !isValidUnit(key, stored[key]))
}

/** Which units to use and which to write to settings, given what is stored. */
export function resolveUnits(
  stored: Partial<Record<keyof UnitDefaults, unknown>>,
  existingInstall: boolean,
  detect: () => UnitDefaults,
): { units: UnitDefaults; toStore: Partial<UnitDefaults> } {
  const units = { ...LEGACY_UNITS }
  const toStore: Partial<UnitDefaults> = {}
  let detected: UnitDefaults | null = null

  function pick<K extends keyof UnitDefaults>(key: K) {
    const value = stored[key]
    if (isValidUnit(key, value)) {
      units[key] = value
      return
    }
    if (existingInstall) {
      units[key] = LEGACY_UNITS[key]
      toStore[key] = LEGACY_UNITS[key]
      return
    }
    detected ??= detect()
    units[key] = detected[key]
    toStore[key] = detected[key]
  }

  for (const key of UNIT_KEYS) pick(key)
  return { units, toStore }
}
