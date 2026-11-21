import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectPlatform } from '@/composables/useInstallPrompt'

describe('detectPlatform', () => {
  it('recognises iPhone and iPadOS (which reports a Mac user agent)', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(
      'ios-safari',
    )
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe(
      'ios-safari',
    )
  })

  it('separates Chrome from Safari on iOS, defaulting to Safari', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/140.0 Mobile/15E148',
        5,
      ),
    ).toBe('ios-chrome')
    expect(
      detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/140.0', 5),
    ).toBe('ios-safari')
  })

  it('separates Firefox from Chrome on Android, defaulting to Chrome', () => {
    expect(
      detectPlatform('Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko Firefox/140.0', 5),
    ).toBe('android-firefox')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 5)).toBe(
      'android-chrome',
    )
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15) SamsungBrowser/28.0', 5)).toBe(
      'android-chrome',
    )
  })

  it('treats a Mac without touch as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop')
  })
})

/** A stand-in for Chrome's event, answering the prompt with the given outcome. */
function fakeInstallEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn(() => Promise.resolve())
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  return { event, prompt }
}

describe('useInstallPrompt', () => {
  beforeEach(() => vi.resetModules())

  it('keeps an event that fired before any component asked for it', async () => {
    const mod = await import('@/composables/useInstallPrompt')
    const { event, prompt } = fakeInstallEvent('accepted')
    window.dispatchEvent(event)

    const install = mod.useInstallPrompt()
    expect(event.defaultPrevented).toBe(true)
    expect(install.canPrompt.value).toBe(true)
    expect(await install.actions.promptInstall()).toBe(true)
    expect(prompt).toHaveBeenCalledOnce()
    expect(install.canPrompt.value).toBe(false)
  })

  it('shares one event between callers and spends it once', async () => {
    const mod = await import('@/composables/useInstallPrompt')
    const banner = mod.useInstallPrompt()
    const settings = mod.useInstallPrompt()
    window.dispatchEvent(fakeInstallEvent('dismissed').event)

    expect(settings.canPrompt.value).toBe(true)
    expect(await banner.actions.promptInstall()).toBe(false)
    expect(settings.canPrompt.value).toBe(false)
    expect(await settings.actions.promptInstall()).toBe(false)
  })

  it('marks the app installed when the browser says so', async () => {
    const mod = await import('@/composables/useInstallPrompt')
    const install = mod.useInstallPrompt()
    window.dispatchEvent(new Event('appinstalled'))
    expect(install.state.standalone).toBe(true)
  })
})
