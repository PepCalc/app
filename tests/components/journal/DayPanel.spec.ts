import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Entry } from '@/domain/entries'
import { atLocalTime } from '@/services/time'
import { useLogStore } from '@/stores/log'
import DayPanel from '@/components/journal/DayPanel.vue'
import { mountWithVuetify } from '../../helpers'

const NOW = new Date(2026, 10, 16, 14, 30).getTime()
const mounted: { unmount(): void }[] = []

function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'kind' | 'at'>): Entry {
  return {
    title: overrides.id,
    detail: '',
    notes: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  setActivePinia(createPinia())
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})

describe('DayPanel', () => {
  it('1. renders rows for each entry in earliest-first time order', () => {
    const day = atLocalTime(NOW, 0, 0, 0)
    const entries = [
      makeEntry({
        id: 'd1',
        kind: 'dose',
        at: new Date(2026, 10, 16, 19, 0).getTime(),
        title: '7.5 mg Zepbound',
      }),
      makeEntry({
        id: 'w1',
        kind: 'weight',
        at: new Date(2026, 10, 16, 7, 55).getTime(),
        title: '82.4 kg',
      }),
    ]
    const wrapper = mountWithVuetify(DayPanel, {
      props: { day, entries, scheduled: [], canLog: true },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    const rows = wrapper.findAll('button.entry-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('82.4 kg')
    expect(rows[1]!.text()).toContain('7.5 mg Zepbound')
  })

  it('2. calls log.edit when an entry row is clicked', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const log = useLogStore()
    const edit = vi.spyOn(log, 'edit')

    const day = atLocalTime(NOW, 0, 0, 0)
    const entry = makeEntry({
      id: 'w42',
      kind: 'weight',
      at: new Date(2026, 10, 16, 7, 55).getTime(),
      title: '82.4 kg',
    })
    const wrapper = mountWithVuetify(DayPanel, {
      props: { day, entries: [entry], scheduled: [], canLog: true },
      global: { plugins: [pinia] },
    })
    mounted.push(wrapper)

    await wrapper.find('button.entry-row').trigger('click')
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'weight', id: 'w42' }))
  })

  it('3. calls openSheet with now for today and 12:00 local for a past day', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const log = useLogStore()
    const openSheet = vi.spyOn(log, 'openSheet')

    const today = atLocalTime(NOW, 0, 0, 0)
    const todayWrapper = mountWithVuetify(DayPanel, {
      props: { day: today, entries: [], scheduled: [], canLog: true },
      global: { plugins: [pinia] },
    })
    mounted.push(todayWrapper)
    await todayWrapper
      .findAll('button')
      .find((b) => b.text().includes('Log for this day'))!
      .trigger('click')
    expect(openSheet).toHaveBeenLastCalledWith({ at: NOW })

    const yesterday = atLocalTime(NOW, -1, 0, 0)
    const pastWrapper = mountWithVuetify(DayPanel, {
      props: { day: yesterday, entries: [], scheduled: [], canLog: true },
      global: { plugins: [pinia] },
    })
    mounted.push(pastWrapper)
    await pastWrapper
      .findAll('button')
      .find((b) => b.text().includes('Log for this day'))!
      .trigger('click')
    expect(openSheet).toHaveBeenLastCalledWith({ at: atLocalTime(yesterday, 0, 12, 0) })
  })

  it('4. hides the Log for this day button when canLog is false', () => {
    const future = atLocalTime(NOW, 2, 0, 0)
    const wrapper = mountWithVuetify(DayPanel, {
      props: { day: future, entries: [], scheduled: [], canLog: false },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    expect(wrapper.text()).not.toContain('Log for this day')
  })

  it('5. shows Nothing logged. on an empty loggable day', () => {
    const day = atLocalTime(NOW, 0, 0, 0)
    const wrapper = mountWithVuetify(DayPanel, {
      props: { day, entries: [], scheduled: [], canLog: true },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    expect(wrapper.text()).toContain('Nothing logged.')
  })

  it('6. renders each scheduled item line', () => {
    const future = atLocalTime(NOW, 2, 0, 0)
    const wrapper = mountWithVuetify(DayPanel, {
      props: { day: future, entries: [], scheduled: ['Wegovy at 8:00 AM'], canLog: false },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    expect(wrapper.text()).toContain('Scheduled: Wegovy at 8:00 AM')
  })
})
