import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import TrendCard from '@/components/charts/TrendCard.vue'
import { mountWithVuetify } from '../../helpers'

const DAY_MS = 86_400_000
const NOW = Date.UTC(2026, 10, 16, 12, 0)
const mounted: { unmount(): void }[] = []

const BodyChartStub = defineComponent({
  name: 'BodyChart',
  props: {
    points: { type: Array, required: true },
    measure: { type: String, required: true },
    window: { type: Object as () => { start: number; end: number } | null, default: null },
  },
  emits: ['update:window'],
  template: '<div data-testid="body-chart-stub" />',
})

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

async function mountWithWeights(daysAgo: number[]) {
  const pinia = setActivePinia(createPinia())
  const journal = useJournalStore()
  const settings = useSettingsStore()
  const photos = usePhotosStore()
  await Promise.all([journal.load(), settings.load(), photos.load()])
  for (const [i, d] of daysAgo.entries()) {
    await journal.addWeight({
      measuredAt: new Date(NOW - d * DAY_MS).toISOString(),
      kg: 90 - i * 0.5,
      enteredUnit: 'kg',
      notes: '',
    })
  }
  const wrapper = mountWithVuetify(TrendCard, {
    global: {
      plugins: [pinia],
      stubs: { BodyChart: BodyChartStub, ShareTrendDialog: true },
    },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('TrendCard range chips', () => {
  it('1. offers 1M, 3M, 6M and All with 7 months of weights, and presses All by default', async () => {
    const wrapper = await mountWithWeights([210, 120, 60, 10])
    const group = wrapper.get('[role="group"][aria-labelledby]')
    const buttons = group.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['1M', '3M', '6M', 'All'])
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ])
  })

  it('2. passes a 91-day window to BodyChart when 3M is pressed', async () => {
    const wrapper = await mountWithWeights([210, 10])
    const btn3m = wrapper.findAll('button').find((b) => b.text() === '3M')!
    await btn3m.trigger('click')
    const chart = wrapper.findComponent(BodyChartStub)
    expect(chart.props('window')).toEqual({ start: NOW - 91 * DAY_MS, end: NOW })
    expect(btn3m.attributes('aria-pressed')).toBe('true')
  })

  it('3. unpresses every chip when BodyChart emits a different window', async () => {
    const wrapper = await mountWithWeights([210, 10])
    const btn3m = wrapper.findAll('button').find((b) => b.text() === '3M')!
    await btn3m.trigger('click')
    expect(btn3m.attributes('aria-pressed')).toBe('true')

    wrapper.findComponent(BodyChartStub).vm.$emit('update:window', {
      start: NOW - 45 * DAY_MS,
      end: NOW - 5 * DAY_MS,
    })
    await flushPromises()

    const group = wrapper.get('[role="group"][aria-labelledby]')
    const pressed = group.findAll('button').map((b) => b.attributes('aria-pressed'))
    expect(pressed).toEqual(['false', 'false', 'false', 'false'])
  })

  it('4. hides the Range group when there are only 3 weeks of data', async () => {
    const wrapper = await mountWithWeights([21, 7])
    expect(wrapper.findAll('[role="group"]')).toHaveLength(0)
  })
})
