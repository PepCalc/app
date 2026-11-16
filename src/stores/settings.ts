import { defineStore } from 'pinia'
import { ref } from 'vue'
import { repository } from '@/db'
import { syringeCatalog } from '@/data'
import { type HeightUnit, type WeightUnit } from '@/domain/bodyUnits'
import { type A1cUnit, type GlucoseUnit } from '@/domain/glucose'
import {
  hasMissingUnit,
  LEGACY_UNITS,
  resolveUnits,
  unitDefaultsFor,
  type RegionalPreferences,
  type UnitDefaults,
} from '@/domain/unitDefaults'
import {
  DEFAULT_REMINDER,
  sanitizeReminderSettings,
  type Reminder,
  type ReminderSettings,
} from '@/domain/reminders'
import { areValidLimits, type AgeLimits } from '@/domain/vialAge'
import { regionalPreferences } from '@/services/locale'

export type ThemePreference = 'system' | 'light' | 'dark'

/** `sourced`: each vial's cited use window; `custom`: the user's own day thresholds. */
export type VialAgeMode = 'sourced' | 'custom'

/** Starting values offered for custom thresholds; the user's choice, not a sourced limit. */
export const DEFAULT_CUSTOM_AGE_LIMITS: AgeLimits = { nearingDays: 45, pastDays: 90 }

/**
 * What the journal needs to know about the person: height for BMI. Optional; nothing here is
 * required to use the app.
 */
export interface Profile {
  heightCm: number | null
}

const EMPTY_PROFILE: Profile = { heightCm: null }

/** A stored or restored profile is untrusted input; keep only fields that are valid. */
export function sanitizeProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) return { ...EMPTY_PROFILE }
  const v = value as Record<string, unknown>
  const height = v.heightCm
  return {
    heightCm: typeof height === 'number' && Number.isFinite(height) && height > 0 ? height : null,
  }
}

/** Keys in the settings table. Renaming one orphans users' saved values: add, never rename. */
const SETTING_KEYS = {
  defaultSyringeId: 'defaultSyringeId',
  theme: 'theme',
  lastBackupAt: 'lastBackupAt',
  disclaimerAcceptedAt: 'disclaimerAcceptedAt',
  installHintDismissed: 'installHintDismissed',
  vialAgeMode: 'vialAgeMode',
  customAgeLimits: 'customAgeLimits',
  weightUnit: 'weightUnit',
  heightUnit: 'heightUnit',
  glucoseUnit: 'glucoseUnit',
  a1cUnit: 'a1cUnit',
  profile: 'profile',
  reminders: 'reminders',
} as const

export const useSettingsStore = defineStore('settings', () => {
  const loaded = ref(false)
  const defaultSyringeId = ref(syringeCatalog.defaultSyringeId)
  const theme = ref<ThemePreference>('system')
  const lastBackupAt = ref<string | null>(null)
  const disclaimerAcceptedAt = ref<string | null>(null)
  const installHintDismissed = ref(false)
  const vialAgeMode = ref<VialAgeMode>('sourced')
  const customAgeLimits = ref<AgeLimits>({ ...DEFAULT_CUSTOM_AGE_LIMITS })
  const weightUnit = ref<WeightUnit>(LEGACY_UNITS.weightUnit)
  const heightUnit = ref<HeightUnit>(LEGACY_UNITS.heightUnit)
  const glucoseUnit = ref<GlucoseUnit>(LEGACY_UNITS.glucoseUnit)
  const a1cUnit = ref<A1cUnit>(LEGACY_UNITS.a1cUnit)
  const profile = ref<Profile>({ ...EMPTY_PROFILE })
  const reminders = ref<ReminderSettings>(sanitizeReminderSettings(null))

  async function load() {
    const [
      syringe,
      themePref,
      backup,
      disclaimer,
      hint,
      ageMode,
      ageLimits,
      wUnit,
      hUnit,
      gUnit,
      aUnit,
      storedProfile,
      remind,
    ] = await Promise.all([
      repository.getSetting<string>(SETTING_KEYS.defaultSyringeId),
      repository.getSetting<ThemePreference>(SETTING_KEYS.theme),
      repository.getSetting<string>(SETTING_KEYS.lastBackupAt),
      repository.getSetting<string>(SETTING_KEYS.disclaimerAcceptedAt),
      repository.getSetting<boolean>(SETTING_KEYS.installHintDismissed),
      repository.getSetting<VialAgeMode>(SETTING_KEYS.vialAgeMode),
      repository.getSetting<AgeLimits>(SETTING_KEYS.customAgeLimits),
      repository.getSetting<WeightUnit>(SETTING_KEYS.weightUnit),
      repository.getSetting<HeightUnit>(SETTING_KEYS.heightUnit),
      repository.getSetting<GlucoseUnit>(SETTING_KEYS.glucoseUnit),
      repository.getSetting<A1cUnit>(SETTING_KEYS.a1cUnit),
      repository.getSetting<unknown>(SETTING_KEYS.profile),
      repository.getSetting<unknown>(SETTING_KEYS.reminders),
    ])
    if (syringe && syringeCatalog.syringes.some((s) => s.id === syringe)) {
      defaultSyringeId.value = syringe
    }
    if (themePref) theme.value = themePref
    lastBackupAt.value = backup ?? null
    disclaimerAcceptedAt.value = disclaimer ?? null
    installHintDismissed.value = hint ?? false
    if (ageMode === 'custom') vialAgeMode.value = ageMode
    // A restored backup is untrusted input; fall back rather than chart nonsense tiers.
    if (ageLimits && areValidLimits(ageLimits)) customAgeLimits.value = ageLimits
    const storedUnits = {
      weightUnit: wUnit,
      heightUnit: hUnit,
      glucoseUnit: gUnit,
      a1cUnit: aUnit,
    }
    const existingInstall = disclaimer !== undefined && disclaimer !== null
    let prefs: RegionalPreferences | null = null
    if (!existingInstall && hasMissingUnit(storedUnits)) {
      try {
        prefs = await regionalPreferences()
      } catch {
        prefs = { region: null, measurementSystem: null }
      }
    }
    const { units, toStore } = resolveUnits(storedUnits, existingInstall, () =>
      unitDefaultsFor(prefs ?? { region: null, measurementSystem: null }),
    )
    weightUnit.value = units.weightUnit
    heightUnit.value = units.heightUnit
    glucoseUnit.value = units.glucoseUnit
    a1cUnit.value = units.a1cUnit
    profile.value = sanitizeProfile(storedProfile)
    reminders.value = sanitizeReminderSettings(remind)
    await Promise.all(
      (Object.keys(toStore) as (keyof UnitDefaults)[]).map((key) => {
        const value = toStore[key]
        return value !== undefined
          ? repository.setSetting(SETTING_KEYS[key], value).catch(() => {})
          : Promise.resolve()
      }),
    )
    loaded.value = true
  }

  async function setDefaultSyringe(id: string) {
    defaultSyringeId.value = id
    await repository.setSetting(SETTING_KEYS.defaultSyringeId, id)
  }

  async function setTheme(value: ThemePreference) {
    theme.value = value
    await repository.setSetting(SETTING_KEYS.theme, value)
  }

  async function markBackedUp(at: string) {
    lastBackupAt.value = at
    await repository.setSetting(SETTING_KEYS.lastBackupAt, at)
  }

  /**
   * Record the acknowledgement on disk first, then close the dialog: closing optimistically let a
   * reload in that window bring the dialog back. Rejects, leaving it open, if the write fails.
   */
  async function acceptDisclaimer(at: string) {
    await repository.setSetting(SETTING_KEYS.disclaimerAcceptedAt, at)
    disclaimerAcceptedAt.value = at
  }

  async function dismissInstallHint() {
    installHintDismissed.value = true
    await repository.setSetting(SETTING_KEYS.installHintDismissed, true)
  }

  async function setVialAgeMode(value: VialAgeMode) {
    vialAgeMode.value = value
    await repository.setSetting(SETTING_KEYS.vialAgeMode, value)
  }

  /** Saves custom thresholds; ignores limits that fail `areValidLimits`. */
  async function setCustomAgeLimits(limits: AgeLimits) {
    if (!areValidLimits(limits)) return
    customAgeLimits.value = { ...limits }
    await repository.setSetting(SETTING_KEYS.customAgeLimits, { ...limits })
  }

  async function setWeightUnit(value: WeightUnit) {
    weightUnit.value = value
    await repository.setSetting(SETTING_KEYS.weightUnit, value)
  }

  async function setHeightUnit(value: HeightUnit) {
    heightUnit.value = value
    await repository.setSetting(SETTING_KEYS.heightUnit, value)
  }

  async function setGlucoseUnit(value: GlucoseUnit) {
    glucoseUnit.value = value
    await repository.setSetting(SETTING_KEYS.glucoseUnit, value)
  }

  async function setA1cUnit(value: A1cUnit) {
    a1cUnit.value = value
    await repository.setSetting(SETTING_KEYS.a1cUnit, value)
  }

  /** Merges `changes` into the profile; invalid values are dropped, never stored. */
  async function updateProfile(changes: Partial<Profile>) {
    const next = sanitizeProfile({ ...profile.value, ...changes })
    profile.value = next
    await repository.setSetting(SETTING_KEYS.profile, { ...next })
  }

  /** One subject's reminder choices, or the defaults (off, 9:00) if never set. */
  function reminderFor(subjectId: string): Reminder {
    return reminders.value.subjects[subjectId] ?? { ...DEFAULT_REMINDER }
  }

  async function saveReminders(next: ReminderSettings) {
    // Sanitising also copies out of the reactive proxy, which IndexedDB cannot clone.
    const clean = sanitizeReminderSettings(next)
    reminders.value = clean
    await repository.setSetting(SETTING_KEYS.reminders, clean)
  }

  async function setReminder(subjectId: string, changes: Partial<Reminder>) {
    const current = reminders.value
    await saveReminders({
      ...current,
      subjects: {
        ...current.subjects,
        [subjectId]: { ...reminderFor(subjectId), ...changes },
      },
    })
  }

  async function setReminderNames(showNames: boolean) {
    await saveReminders({ ...reminders.value, showNames })
  }

  return {
    loaded,
    defaultSyringeId,
    theme,
    lastBackupAt,
    disclaimerAcceptedAt,
    installHintDismissed,
    vialAgeMode,
    customAgeLimits,
    weightUnit,
    heightUnit,
    glucoseUnit,
    a1cUnit,
    profile,
    reminders,
    load,
    setDefaultSyringe,
    setTheme,
    markBackedUp,
    acceptDisclaimer,
    dismissInstallHint,
    setVialAgeMode,
    setCustomAgeLimits,
    setWeightUnit,
    setHeightUnit,
    setGlucoseUnit,
    setA1cUnit,
    updateProfile,
    reminderFor,
    setReminder,
    setReminderNames,
  }
})
