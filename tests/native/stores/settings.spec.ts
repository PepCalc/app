import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db'
import { useSettingsStore } from '@/stores/settings'

vi.mock('@/services/locale', () => ({
  regionalPreferences: async () => ({ region: null, measurementSystem: null }),
}))

describe('settings.realisticSyringe (native)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('hides the needle and plunger by default in the store apps', async () => {
    const settings = useSettingsStore()
    expect(settings.realisticSyringe).toBe(false)
    await settings.load()
    expect(settings.realisticSyringe).toBe(false)
  })

  it('keeps the choice once the user turns it on', async () => {
    const settings = useSettingsStore()
    await settings.load()
    await settings.setRealisticSyringe(true)

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    await reloaded.load()
    expect(reloaded.realisticSyringe).toBe(true)
  })
})
