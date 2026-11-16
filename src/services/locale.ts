import { registerPlugin } from '@capacitor/core'
import { regionOf, type MeasurementSystem, type RegionalPreferences } from '@/domain/unitDefaults'

interface RegionalPreferencesPlugin {
  get(): Promise<{ region?: string; measurementSystem?: string }>
}

const VALID_SYSTEMS = new Set<MeasurementSystem>(['metric', 'us', 'uk'])

// Registered once under the native guard so web builds drop @capacitor/core and native builds
// never trigger Capacitor's duplicate-registration warning.
const RegionalPreferences = __NATIVE__
  ? registerPlugin<RegionalPreferencesPlugin>('RegionalPreferences')
  : null

function parseSystem(value: string | undefined): MeasurementSystem | null {
  return value && VALID_SYSTEMS.has(value as MeasurementSystem)
    ? (value as MeasurementSystem)
    : null
}

function browserPreferences(): RegionalPreferences {
  const tags = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : []
  return {
    region: regionOf(tags, (tag) => new Intl.Locale(tag).maximize().region),
    measurementSystem: null,
  }
}

/**
 * The device's region and measurement system: from the system in the apps, from the browser on
 * the web.
 */
export async function regionalPreferences(): Promise<RegionalPreferences> {
  if (RegionalPreferences) {
    try {
      const result = await RegionalPreferences.get()
      const rawRegion = result.region?.trim() ?? ''
      return {
        region: rawRegion ? rawRegion.toUpperCase() : null,
        measurementSystem: parseSystem(result.measurementSystem),
      }
    } catch {
      return browserPreferences()
    }
  }
  return browserPreferences()
}
