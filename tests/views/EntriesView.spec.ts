import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { db } from '@/db'
import { createAppRouter } from '@/router'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import EntriesView from '@/views/EntriesView.vue'
import { mountWithVuetify } from '../helpers'

const NOW = new Date(2026, 10, 16, 12, 0).getTime()
const mounted: { unmount(): void }[] = []

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await Promise.all(db.tables.map((t) => t.clear()))
  setActivePinia(createPinia())
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})

async function mountEntries(path = '/progress/entries') {
  const pinia = setActivePinia(createPinia())
  const journal = useJournalStore()
  const settings = useSettingsStore()
  const photos = usePhotosStore()
  await Promise.all([journal.load(), settings.load(), photos.load()])
  await settings.setWeightUnit('kg')

  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()

  const wrapper = mountWithVuetify(EntriesView, {
    global: { plugins: [pinia, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router, journal }
}

describe('EntriesView', () => {
  it('switches between List and Calendar via the View toggle', async () => {
    const { wrapper, router } = await mountEntries()
    expect(wrapper.find('.entries-timeline').exists()).toBe(true)
    expect(wrapper.find('.entries-calendar').exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Calendar')!
      .trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.view).toBe('calendar')
    expect(wrapper.find('.entries-calendar').exists()).toBe(true)
    expect(wrapper.find('.day-panel').exists()).toBe(true)
  })

  it('opens on the calendar when ?view=calendar is in the route query', async () => {
    const { wrapper } = await mountEntries('/progress/entries?view=calendar')
    expect(wrapper.find('.entries-calendar').exists()).toBe(true)
    expect(wrapper.find('.entries-timeline').exists()).toBe(false)
  })

  it('shares the Weight filter chip across both the calendar marks and the day panel', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addSymptoms([
      {
        occurredAt: new Date(2026, 10, 16, 8, 10).toISOString(),
        symptom: 'nausea',
        otherText: '',
        severity: 'mild',
        notes: '',
      },
    ])
    await journal.addWeight({
      measuredAt: new Date(2026, 10, 16, 7, 55).toISOString(),
      kg: 82.4,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountEntries('/progress/entries?view=calendar')
    expect(wrapper.find('.day-panel').text()).toContain('Nausea')
    expect(wrapper.find('.day-panel').text()).toContain('82.4 kg')

    const weightChip = wrapper.findAll('button.v-chip').find((c) => c.text().includes('Weight'))!
    await weightChip.trigger('click')
    await flushPromises()

    expect(wrapper.find('.day-panel').text()).toContain('82.4 kg')
    expect(wrapper.find('.day-panel').text()).not.toContain('Nausea')

    const picker = wrapper.findComponent({ name: 'VDatePicker' })
    const eventsFn = picker.props('events') as (iso: string) => string | boolean
    expect(eventsFn('2026-11-16')).toBe('primary')

    const todayBtn = wrapper.find('[data-v-date="2026-11-16"]')
    expect(todayBtn.attributes('aria-label')).toContain('1 weigh-in')
    expect(todayBtn.attributes('aria-label')).not.toContain('side effect')
  })
})
