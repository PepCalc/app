import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { db } from '@/db'
import { createAppRouter } from '@/router'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import ProgressView from '@/views/ProgressView.vue'
import { mountWithVuetify } from '../helpers'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const NOW = Date.UTC(2026, 10, 16, 12, 0)
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

async function mountProgress() {
  const pinia = setActivePinia(createPinia())
  const shelf = useShelfStore()
  const journal = useJournalStore()
  const settings = useSettingsStore()
  const photos = usePhotosStore()
  await Promise.all([shelf.load(), journal.load(), settings.load(), photos.load()])
  await settings.setWeightUnit('kg')

  const router = createAppRouter(createMemoryHistory())
  await router.push('/progress')
  await router.isReady()

  const wrapper = mountWithVuetify(ProgressView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        TrendCard: { template: '<div data-testid="trend-card-stub" />' },
        PhotosCard: { template: '<div data-testid="photos-card-stub" />' },
        ExportReportDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue" role="dialog" aria-label="Export report" />',
        },
      },
    },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, journal }
}

describe('ProgressView', () => {
  it('1. shows three stat tiles with the right text for two weigh-ins 10 weeks apart', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addWeight({
      measuredAt: new Date(NOW - 10 * WEEK_MS).toISOString(),
      kg: 100,
      enteredUnit: 'kg',
      notes: '',
    })
    await journal.addWeight({
      measuredAt: new Date(NOW).toISOString(),
      kg: 90,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountProgress()
    const tiles = wrapper.findAll('.stat-tile')
    expect(tiles).toHaveLength(3)
    expect(tiles[0]!.text()).toContain('Total change')
    expect(tiles[0]!.text()).toContain('−10 kg')
    expect(tiles[1]!.text()).toContain('Percent')
    expect(tiles[1]!.text()).toContain('−10%')
    expect(tiles[2]!.text()).toContain('Weekly average')
    expect(tiles[2]!.text()).toContain('−1 kg')
  })

  it('2. hides the stat tiles when there is only one weigh-in', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addWeight({
      measuredAt: new Date(NOW).toISOString(),
      kg: 100,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountProgress()
    expect(wrapper.findAll('.stat-tile')).toHaveLength(0)
  })

  it('3. renders sections in the documented order', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addWeight({
      measuredAt: new Date(NOW - 3 * WEEK_MS).toISOString(),
      kg: 100,
      enteredUnit: 'kg',
      notes: '',
    })
    await journal.addWeight({
      measuredAt: new Date(NOW).toISOString(),
      kg: 97,
      enteredUnit: 'kg',
      notes: '',
    })
    await journal.addSymptoms([
      {
        symptom: 'nausea',
        otherText: '',
        severity: 'mild',
        occurredAt: new Date(NOW - DAY_MS).toISOString(),
        notes: '',
      },
    ])

    const { wrapper } = await mountProgress()
    const html = wrapper.html()
    const order = [
      'stat-tile',
      'trend-card-stub',
      'id="photos"',
      'id="side-effects"',
      'All entries',
    ]
    const indices = order.map((needle) => html.indexOf(needle))
    expect(indices.every((i) => i >= 0)).toBe(true)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!)
    }
  })

  it('4. has exactly one Export PDF button and clicking it opens the export dialog', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addWeight({
      measuredAt: new Date(NOW).toISOString(),
      kg: 100,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountProgress()
    const exportButtons = wrapper.findAll('button').filter((b) => b.text().includes('Export PDF'))
    expect(exportButtons).toHaveLength(1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await exportButtons[0]!.trigger('click')
    expect(wrapper.find('[role="dialog"][aria-label="Export report"]').exists()).toBe(true)
  })

  it('5. shows the first weigh-in basis line', async () => {
    const pre = setActivePinia(createPinia())
    const journal = useJournalStore(pre)
    await journal.load()
    await journal.addWeight({
      measuredAt: new Date(NOW - 3 * WEEK_MS).toISOString(),
      kg: 100,
      enteredUnit: 'kg',
      notes: '',
    })
    await journal.addWeight({
      measuredAt: new Date(NOW).toISOString(),
      kg: 97,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountProgress()
    expect(wrapper.text()).toContain('Since your first weigh-in.')
  })
})
