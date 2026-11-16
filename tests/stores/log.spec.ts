import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLogStore } from '@/stores/log'

describe('useLogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens the sheet and starts a new entry with its context', () => {
    const log = useLogStore()
    log.openSheet({ at: 1_700_000_000_000 })
    expect(log.sheetOpen).toBe(true)
    expect(log.sheetContext).toEqual({ at: 1_700_000_000_000 })

    log.start('dose', { medicationId: 'm1', at: 1_700_000_000_000 })
    expect(log.sheetOpen).toBe(false)
    expect(log.target).toEqual({
      kind: 'dose',
      id: null,
      context: { medicationId: 'm1', at: 1_700_000_000_000 },
    })
  })

  it('sets an edit target by kind and id', () => {
    const log = useLogStore()
    log.edit({ kind: 'weight', id: 'w1' })
    expect(log.target).toEqual({ kind: 'weight', id: 'w1', context: {} })
  })

  it('clears the target on close', () => {
    const log = useLogStore()
    log.start('weight')
    log.close()
    expect(log.target).toBeNull()
  })

  it('replaces the active target when starting another entry', () => {
    const log = useLogStore()
    log.edit({ kind: 'weight', id: 'w1' })
    log.start('symptom', { at: 1_700_000_000_000 })
    expect(log.target).toEqual({
      kind: 'symptom',
      id: null,
      context: { at: 1_700_000_000_000 },
    })
  })
})
