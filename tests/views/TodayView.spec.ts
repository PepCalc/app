import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { db } from '@/db'
import { createAppRouter } from '@/router'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import TodayView from '@/views/TodayView.vue'
import { mountWithVuetify } from '../helpers'

const DAY_MS = 86_400_000
const mounted: { unmount(): void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(db.tables.map((t) => t.clear()))
  setActivePinia(createPinia())
})

async function mountToday() {
  const pinia = setActivePinia(createPinia())
  const shelf = useShelfStore()
  const protocols = useProtocolsStore()
  const journal = useJournalStore()
  const settings = useSettingsStore()
  const photos = usePhotosStore()
  await Promise.all([
    shelf.load(),
    protocols.load(),
    journal.load(),
    settings.load(),
    photos.load(),
  ])

  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()

  const wrapper = mountWithVuetify(TodayView, {
    global: { plugins: [pinia, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

describe('TodayView', () => {
  it('shows the Mix your first vial empty state with units line on an empty database', async () => {
    const { wrapper } = await mountToday()
    expect(wrapper.text()).toContain('Mix your first vial')
    expect(wrapper.text()).toContain('Open the calculator')
    expect(wrapper.text()).toMatch(/Units: .+\./)
  })

  it('renders Due, In your system, Latest and Recent in heading order when seeded', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    const protocols = useProtocolsStore(pre)
    const journal = useJournalStore(pre)
    await Promise.all([shelf.load(), protocols.load(), journal.load()])

    const vial = await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: new Date(Date.now() - DAY_MS).toISOString(),
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: vial.id,
      takenAt: new Date(Date.now() - DAY_MS).toISOString(),
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await protocols.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      intervalHours: 168,
      notes: '',
    })
    await journal.addWeight({
      measuredAt: new Date(Date.now() - DAY_MS).toISOString(),
      kg: 82.4,
      enteredUnit: 'kg',
      notes: '',
    })

    const { wrapper } = await mountToday()
    const h2s = wrapper.findAll('h2').map((h) => h.text())
    expect(h2s).toEqual(['Due', 'In your system', 'Latest', 'Recent'])
    expect(wrapper.text()).toContain('Semaglutide')
  })

  it('hides In your system when there is no level data', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    const protocols = useProtocolsStore(pre)
    await Promise.all([shelf.load(), protocols.load()])

    await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mcg',
      amount: 5000,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 250, unit: 'mcg' },
      pkOverride: null,
      reconstitutedAt: null,
      status: 'active',
      notes: '',
    })
    await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      intervalHours: 24,
      notes: '',
    })

    const { wrapper } = await mountToday()
    const h2s = wrapper.findAll('h2').map((h) => h.text())
    expect(h2s).toEqual(['Due'])
    expect(wrapper.text()).not.toContain('In your system')
  })

  it('shows a shelf notice for a vial with two doses left', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    await shelf.load()

    const vial = await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mcg',
      amount: 1000,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 250, unit: 'mcg' },
      pkOverride: null,
      reconstitutedAt: null,
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: vial.id,
      takenAt: new Date(Date.now() - DAY_MS).toISOString(),
      dose: { value: 500, unit: 'mcg' },
      volumeMl: 1,
      syringeId: 'u100-1ml',
      notes: '',
    })

    const { wrapper } = await mountToday()
    expect(wrapper.text()).toContain('BPC-157: about 2 doses left.')
  })
})
