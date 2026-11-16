import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const nativeLoaded = vi.hoisted(() => vi.fn())
vi.mock('@/services/health/nativeHealth', () => {
  nativeLoaded()
  return {}
})

const { useHealthSyncStore } = await import('@/stores/healthSync')

describe('healthSync (web)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    nativeLoaded.mockClear()
  })

  it('resolves unavailable and never imports the native module', async () => {
    const health = useHealthSyncStore()
    expect(await health.run(true)).toEqual({ status: 'unavailable' })
    expect(nativeLoaded).not.toHaveBeenCalled()
  })
})
