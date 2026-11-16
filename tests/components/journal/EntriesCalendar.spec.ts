import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Entry } from '@/domain/entries'
import * as entryDays from '@/domain/entryDays'
import { atLocalTime } from '@/services/time'
import EntriesCalendar from '@/components/journal/EntriesCalendar.vue'
import { mountWithVuetify } from '../../helpers'

const NOW = new Date(2026, 10, 16, 12, 0).getTime()
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
  vi.restoreAllMocks()
})

describe('EntriesCalendar', () => {
  it('1 & 2. reports days with entries via the events prop and returns false for empty days', () => {
    const entries = [
      makeEntry({ id: 'd1', kind: 'dose', at: new Date(2026, 10, 10, 8, 0).getTime() }),
    ]
    const wrapper = mountWithVuetify(EntriesCalendar, {
      props: { entries, lastSelectable: NOW },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    const picker = wrapper.findComponent({ name: 'VDatePicker' })
    const eventsFn = picker.props('events') as (isoDate: string) => string | boolean
    expect(eventsFn('2026-11-10')).toBeTruthy()
    expect(eventsFn('2026-11-11')).toBe(false)
  })

  it('3. emits the start of the local day when a date is selected', async () => {
    const entries: Entry[] = []
    const wrapper = mountWithVuetify(EntriesCalendar, {
      props: { entries, lastSelectable: NOW },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    const target = wrapper.find('[data-v-date="2026-11-10"]')
    await target.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]![0]).toBe(new Date(2026, 10, 10, 0, 0, 0, 0).getTime())
  })

  it('4. returns selection and month to today when Today is clicked', async () => {
    const wrapper = mountWithVuetify(EntriesCalendar, {
      props: { entries: [], lastSelectable: NOW },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    await wrapper.find('button[aria-label="Previous month"]').trigger('click')
    await wrapper.find('[data-v-date="2026-10-05"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Today')!
      .trigger('click')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1]![0]).toBe(atLocalTime(NOW, 0, 0, 0))
    expect(wrapper.text()).toContain('November 2026')
  })

  it('5. runs markDays once for a render of a full month', () => {
    const spy = vi.spyOn(entryDays, 'markDays')
    const entries = [
      makeEntry({ id: 'd1', kind: 'dose', at: new Date(2026, 10, 16, 8, 10).getTime() }),
      makeEntry({ id: 'w1', kind: 'weight', at: new Date(2026, 10, 16, 7, 55).getTime() }),
    ]
    const wrapper = mountWithVuetify(EntriesCalendar, {
      props: { entries, lastSelectable: NOW },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('6. includes dayMarkText in the day aria-label and live summary for the chosen day', () => {
    const entries = [
      makeEntry({ id: 'd1', kind: 'dose', at: new Date(2026, 10, 16, 8, 10).getTime() }),
      makeEntry({ id: 'w1', kind: 'weight', at: new Date(2026, 10, 16, 7, 55).getTime() }),
      makeEntry({ id: 'w2', kind: 'weight', at: new Date(2026, 10, 16, 19, 0).getTime() }),
    ]
    const wrapper = mountWithVuetify(EntriesCalendar, {
      props: { entries, lastSelectable: NOW },
      global: { plugins: [createPinia()] },
    })
    mounted.push(wrapper)

    const live = wrapper.find('[aria-live="polite"]')
    expect(live.text()).toContain('1')
    expect(live.text()).toContain('2 weigh-ins')

    const todayBtn = wrapper.find('[data-v-date="2026-11-16"]')
    expect(todayBtn.attributes('aria-label')).toContain('2 weigh-ins')
  })
})
