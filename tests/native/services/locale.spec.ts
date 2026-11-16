import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ get: mockGet }),
}))

const { regionalPreferences } = await import('@/services/locale')

describe('regionalPreferences (native)', () => {
  afterEach(() => {
    mockGet.mockReset()
    vi.unstubAllGlobals()
  })

  it('upper-cases region and keeps a valid measurement system', async () => {
    mockGet.mockResolvedValue({ region: 'us', measurementSystem: 'us' })
    expect(await regionalPreferences()).toEqual({ region: 'US', measurementSystem: 'us' })
  })

  it('treats an empty region and missing system as null', async () => {
    mockGet.mockResolvedValue({ region: '' })
    expect(await regionalPreferences()).toEqual({ region: null, measurementSystem: null })
  })

  it('ignores an unknown measurement system', async () => {
    mockGet.mockResolvedValue({ region: 'DE', measurementSystem: 'imperial' })
    expect(await regionalPreferences()).toEqual({ region: 'DE', measurementSystem: null })
  })

  it('falls back to the web path when the plugin rejects', async () => {
    mockGet.mockRejectedValue(new Error('unavailable'))
    vi.stubGlobal('navigator', { ...navigator, languages: ['en-CA'], language: 'en-CA' })
    expect(await regionalPreferences()).toEqual({ region: 'CA', measurementSystem: null })
  })
})
