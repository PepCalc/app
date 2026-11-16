import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db, repository } from '@/db'
import { LEGACY_UNITS } from '@/domain/unitDefaults'
import { sanitizeProfile, useSettingsStore } from '@/stores/settings'

const mockRegionalPreferences = vi.fn()

vi.mock('@/services/locale', () => ({
  regionalPreferences: () => mockRegionalPreferences(),
}))

describe('settings.acceptDisclaimer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('marks the notice accepted only after the acceptance is saved', async () => {
    let finishWrite = () => {}
    vi.spyOn(repository, 'setSetting').mockReturnValue(
      new Promise<void>((resolve) => (finishWrite = resolve)),
    )
    const settings = useSettingsStore()
    const pending = settings.acceptDisclaimer('2026-10-29T12:00:00.000Z')
    expect(settings.disclaimerAcceptedAt).toBeNull()
    finishWrite()
    await pending
    expect(settings.disclaimerAcceptedAt).toBe('2026-10-29T12:00:00.000Z')
  })

  it('keeps the notice open when the save fails', async () => {
    vi.spyOn(repository, 'setSetting').mockRejectedValue(new Error('QuotaExceededError'))
    const settings = useSettingsStore()
    await expect(settings.acceptDisclaimer('2026-10-29T12:00:00.000Z')).rejects.toThrow()
    expect(settings.disclaimerAcceptedAt).toBeNull()
  })
})

describe('sanitizeProfile', () => {
  it('keeps valid fields and drops the rest, so a restored backup cannot break the app', () => {
    expect(sanitizeProfile({ heightCm: -4, birthMonth: '1990-06', gender: 'x' })).toEqual({
      heightCm: null,
    })
    expect(sanitizeProfile('nonsense')).toEqual({ heightCm: null })
    expect(sanitizeProfile({ heightCm: 172.5 })).toEqual({ heightCm: 172.5 })
  })
})

describe('settings.load', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    mockRegionalPreferences.mockReset()
    mockRegionalPreferences.mockResolvedValue({ region: null, measurementSystem: null })
  })

  it('detects and stores regional units on a new install', async () => {
    mockRegionalPreferences.mockResolvedValue({ region: 'US', measurementSystem: null })
    const settings = useSettingsStore()
    await settings.load()

    expect(settings.weightUnit).toBe('lb')
    expect(settings.heightUnit).toBe('ftin')
    expect(settings.glucoseUnit).toBe('mg/dL')
    expect(settings.a1cUnit).toBe('%')
    expect(await repository.getSetting('weightUnit')).toBe('lb')
    expect(await repository.getSetting('heightUnit')).toBe('ftin')
    expect(await repository.getSetting('glucoseUnit')).toBe('mg/dL')
    expect(await repository.getSetting('a1cUnit')).toBe('%')
  })

  it('keeps legacy units on an existing install without consulting regionalPreferences', async () => {
    await repository.setSetting('disclaimerAcceptedAt', '2026-10-01T00:00:00.000Z')
    const settings = useSettingsStore()
    await settings.load()

    expect(mockRegionalPreferences).not.toHaveBeenCalled()
    expect(settings.weightUnit).toBe('kg')
    expect(settings.heightUnit).toBe('cm')
    expect(settings.glucoseUnit).toBe('mg/dL')
    expect(settings.a1cUnit).toBe('%')
    expect(await repository.getSetting('weightUnit')).toBe('kg')
    expect(await repository.getSetting('heightUnit')).toBe('cm')
    expect(await repository.getSetting('glucoseUnit')).toBe('mg/dL')
    expect(await repository.getSetting('a1cUnit')).toBe('%')
  })

  it('preserves a stored unit when regionalPreferences points elsewhere', async () => {
    await repository.setSetting('weightUnit', 'lb')
    mockRegionalPreferences.mockResolvedValue({ region: 'DE', measurementSystem: null })
    const settings = useSettingsStore()
    await settings.load()

    expect(settings.weightUnit).toBe('lb')
    expect(settings.heightUnit).toBe('cm')
  })

  it('falls back to legacy units when regionalPreferences rejects', async () => {
    mockRegionalPreferences.mockRejectedValue(new Error('bridge failed'))
    const settings = useSettingsStore()
    await settings.load()

    expect(settings.loaded).toBe(true)
    expect(settings.weightUnit).toBe(LEGACY_UNITS.weightUnit)
    expect(settings.heightUnit).toBe(LEGACY_UNITS.heightUnit)
    expect(settings.glucoseUnit).toBe(LEGACY_UNITS.glucoseUnit)
    expect(settings.a1cUnit).toBe(LEGACY_UNITS.a1cUnit)
  })

  it('still loads when saving detected units rejects', async () => {
    mockRegionalPreferences.mockResolvedValue({ region: 'US', measurementSystem: null })
    vi.spyOn(repository, 'setSetting').mockRejectedValue(new Error('QuotaExceededError'))
    const settings = useSettingsStore()
    await settings.load()

    expect(settings.loaded).toBe(true)
    expect(settings.weightUnit).toBe('lb')
    expect(settings.heightUnit).toBe('ftin')
  })
})
