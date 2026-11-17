import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { db } from '@/db'
import { createAppRouter } from '@/router'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { mountWithVuetify } from '../helpers'

vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="v-chart-stub" />',
  },
}))

const { default: PeptideView } = await import('@/views/PeptideView.vue')

const DAY_MS = 86_400_000
const mounted: { unmount(): void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

beforeEach(async () => {
  vi.restoreAllMocks()
  if (!globalThis.visualViewport) {
    Object.defineProperty(globalThis, 'visualViewport', {
      value: {
        width: 390,
        height: 844,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    })
  }
  await Promise.all(db.tables.map((t) => t.clear()))
  setActivePinia(createPinia())
})

async function mountPage(peptideKey: string) {
  const pinia = setActivePinia(createPinia())
  const shelf = useShelfStore()
  const protocols = useProtocolsStore()
  const settings = useSettingsStore()
  await Promise.all([shelf.load(), protocols.load(), settings.load()])

  const router = createAppRouter(createMemoryHistory())
  await router.push({ name: 'peptide', params: { key: peptideKey } })
  await router.isReady()

  const wrapper = mountWithVuetify(PeptideView, {
    props: { peptideKey },
    global: { plugins: [pinia, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, shelf, protocols, log: useLogStore() }
}

describe('PeptideView', () => {
  it('shows name, due text, one chart with Estimated levels eyebrow, and catalog summary', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    const protocols = useProtocolsStore(pre)
    await Promise.all([shelf.load(), protocols.load()])
    const vial = await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 3,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: new Date(Date.now() - 4 * DAY_MS).toISOString(),
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: vial.id,
      takenAt: new Date(Date.now() - 4 * DAY_MS).toISOString(),
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.15,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await protocols.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      schedule: { kind: 'interval', everyHours: 168 },
      plannedDose: null,
      course: null,
      notes: '',
    })

    const { wrapper } = await mountPage('semaglutide')
    expect(wrapper.find('h1').text()).toBe('Semaglutide')
    expect(wrapper.text()).toContain('Due in 3 days')
    expect(wrapper.text()).toContain('Estimated levels')
    expect(wrapper.findAll('[role="img"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('GLP-1 receptor agonist')
  })

  it('calls log.start with the draw vial when Log a draw is clicked', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    await shelf.load()
    const vial = await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 250, unit: 'mcg' },
      pkOverride: null,
      reconstitutedAt: new Date().toISOString(),
      status: 'active',
      notes: '',
    })

    const { wrapper, log } = await mountPage('bpc-157')
    const startSpy = vi.spyOn(log, 'start')
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Log a draw'))!
    await btn.trigger('click')
    expect(startSpy).toHaveBeenCalledWith('dose', { vialId: vial.id })
  })

  it('shows not-found card for an unknown key', async () => {
    const { wrapper } = await mountPage('semaglutide')
    expect(wrapper.text()).toContain('This peptide is not on your shelf.')
  })

  it('lists two vials, shows Add a schedule without a protocol, and hides summary for custom peptides', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    await shelf.load()
    await shelf.addVial({
      peptideId: null,
      name: 'My peptide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-01T08:00:00.000Z',
      status: 'active',
      notes: '',
    })
    await shelf.addVial({
      peptideId: null,
      name: 'My peptide',
      kind: 'single',
      unit: 'mg',
      amount: 10,
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: '2026-10-02T08:00:00.000Z',
      status: 'archived',
      notes: '',
    })

    const { wrapper } = await mountPage('name:my peptide')
    expect(wrapper.text()).toContain('My peptide #1')
    expect(wrapper.text()).toContain('My peptide #2')
    expect(wrapper.text()).toContain('Add a schedule')
    expect(wrapper.text()).not.toContain('GLP-1')

    const cards = wrapper.findAll('.vial-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.classes()).not.toContain('vial-card--archived')
    expect(cards[0]!.text()).toContain('Calculate a draw')
    expect(cards[1]!.classes()).toContain('vial-card--archived')
    expect(cards[1]!.text()).toContain('Archived')
    expect(cards[1]!.text()).not.toContain('Calculate a draw')
    expect(cards[1]!.text()).not.toContain('left')
  })
})
