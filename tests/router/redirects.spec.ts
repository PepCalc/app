import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '@/router'

describe('router redirects and resolution', () => {
  it('redirects legacy paths to Stack and Vial', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/shelf')
    expect(router.currentRoute.value.name).toBe('stack')

    await router.push('/shelf/abc')
    expect(router.currentRoute.value.name).toBe('vial')
    expect(router.currentRoute.value.params).toEqual({ id: 'abc' })

    await router.push('/protocols')
    expect(router.currentRoute.value.name).toBe('stack')

    await router.push('/history')
    expect(router.currentRoute.value.name).toBe('stack')
  })

  it('resolves /stack/levels to levels and encoded custom keys to peptide', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/stack/levels')
    expect(router.currentRoute.value.name).toBe('levels')

    await router.push('/stack/name%3AMy%20blend')
    expect(router.currentRoute.value.name).toBe('peptide')
    expect(router.currentRoute.value.params).toEqual({ key: 'name:My blend' })
  })
})
