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

  it('opens Today at / and forwards ?vial= and ?peptide= to Calculator', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/')
    expect(router.currentRoute.value.name).toBe('today')

    await router.push('/?vial=abc')
    expect(router.currentRoute.value.name).toBe('calculator')
    expect(router.currentRoute.value.query).toEqual({ vial: 'abc' })

    await router.push('/?peptide=semaglutide')
    expect(router.currentRoute.value.name).toBe('calculator')
    expect(router.currentRoute.value.query).toEqual({ peptide: 'semaglutide' })

    await router.push('/calculator')
    expect(router.currentRoute.value.name).toBe('calculator')
  })

  it('redirects /journal to progress and resolves /progress/entries to entries', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/journal')
    expect(router.currentRoute.value.name).toBe('progress')
    expect(router.currentRoute.value.fullPath).toBe('/progress')

    await router.push('/progress/entries')
    expect(router.currentRoute.value.name).toBe('entries')
  })
})
