import { afterEach, describe, expect, it, vi } from 'vitest'
import { regionalPreferences } from '@/services/locale'

describe('regionalPreferences (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubNavigator(languages: readonly string[], language = '') {
    vi.stubGlobal('navigator', { ...navigator, languages, language })
  }

  it('reads the first explicit region from navigator.languages', async () => {
    stubNavigator(['en-GB', 'en'], 'en-US')
    expect(await regionalPreferences()).toEqual({ region: 'GB', measurementSystem: null })
  })

  it('falls back to navigator.language when navigator.languages is empty', async () => {
    stubNavigator([], 'de')
    expect(await regionalPreferences()).toEqual({ region: 'DE', measurementSystem: null })
  })

  it('returns null region without throwing on a malformed tag', async () => {
    stubNavigator(['not a tag'], 'not a tag')
    expect(await regionalPreferences()).toEqual({ region: null, measurementSystem: null })
  })
})
