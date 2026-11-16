import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useJournalStore } from '@/stores/journal'
import { useLogStore } from '@/stores/log'
import { useNotifyStore } from '@/stores/notify'
import { useSettingsStore } from '@/stores/settings'
import LogHost from '@/components/journal/LogHost.vue'
import { mountWithVuetify } from '../../helpers'

if (typeof globalThis.visualViewport === 'undefined') {
  Object.defineProperty(globalThis, 'visualViewport', {
    configurable: true,
    value: {
      width: 390,
      height: 844,
      scale: 1,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
}

async function flushUi() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

describe('LogHost', () => {
  let wrappers: ReturnType<typeof mountWithVuetify>[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    document.body.innerHTML = ''
  })

  function mountHost() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mountWithVuetify(LogHost, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { RouterLink: true },
      },
    })
    wrappers.push(wrapper)
    return { wrapper, pinia }
  }

  it('shows a list with the app kinds in order and disables Draw when no vials exist', async () => {
    mountHost()
    const log = useLogStore()
    log.openSheet()
    await flushUi()

    const sheet = document.body.querySelector('.v-bottom-sheet')!
    const items = [...sheet.querySelectorAll('.v-list-item-title')].map((el) =>
      el.textContent?.trim(),
    )
    expect(items).toEqual(['Draw', 'Weight', 'Side effect', 'Blood sugar', 'Vitals', 'Photo'])
    const drawBtn = [...sheet.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Draw'),
    )!
    expect(drawBtn.getAttribute('aria-disabled')).toBe('true')
    expect(drawBtn.classList.contains('v-list-item--disabled')).toBe(true)
    expect(sheet.textContent).toContain('Save a vial first.')
  })

  it('opens an empty Weigh-in dialog when Weight is chosen', async () => {
    mountHost()
    const log = useLogStore()
    log.openSheet()
    await flushUi()

    const weightBtn = [...document.body.querySelectorAll('.v-bottom-sheet button')].find((b) =>
      b.textContent?.includes('Weight'),
    ) as HTMLButtonElement
    weightBtn.click()
    await flushUi()

    expect(log.sheetOpen).toBe(false)
    const dialog = [...document.body.querySelectorAll('[role="dialog"]')].find((d) =>
      d.textContent?.includes('Weigh-in'),
    )
    expect(dialog).toBeDefined()
    const input = dialog!.querySelector('input[type="number"]') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('opens an existing weight filled in when log.edit is called', async () => {
    mountHost()
    const settings = useSettingsStore()
    settings.weightUnit = 'kg'
    const journal = useJournalStore()
    journal.measurements = [
      {
        id: 'w1',
        metric: 'weight',
        measuredAt: '2026-11-16T08:00:00.000Z',
        value: 82.4,
        enteredUnit: 'kg',
        notes: '',
        createdAt: '2026-11-16T08:00:00.000Z',
      },
    ]

    const log = useLogStore()
    log.edit({ kind: 'weight', id: 'w1' })
    await flushUi()

    const dialog = document.body.querySelector('[role="dialog"]')!
    const input = dialog.querySelector('input[type="number"]') as HTMLInputElement
    expect(input.value).toBe('82.4')
  })

  it('closes and notifies when log.edit targets a missing entry', async () => {
    mountHost()
    const log = useLogStore()
    const notify = useNotifyStore()

    log.edit({ kind: 'weight', id: 'missing' })
    await flushUi()

    expect(log.target).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(notify.current?.text).toBe('That entry is gone.')
  })

  it('resets the form when Weight is opened, typed in, closed and opened again', async () => {
    mountHost()
    const log = useLogStore()

    log.start('weight')
    await flushUi()
    let input = document.body.querySelector(
      '[role="dialog"] input[type="number"]',
    ) as HTMLInputElement
    input.value = '80.5'
    input.dispatchEvent(new Event('input'))
    await flushUi()

    const cancel = [...document.body.querySelectorAll('[role="dialog"] button')].find((b) =>
      b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement
    cancel.click()
    await flushUi()
    expect(log.target).toBeNull()

    log.start('weight')
    await flushUi()
    input = document.body.querySelector('[role="dialog"] input[type="number"]') as HTMLInputElement
    expect(input.value).toBe('')
  })
})
