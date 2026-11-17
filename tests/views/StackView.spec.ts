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
import StackView from '@/views/StackView.vue'
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

async function mountStack() {
  const pinia = setActivePinia(createPinia())
  const shelf = useShelfStore()
  const protocols = useProtocolsStore()
  const settings = useSettingsStore()
  await Promise.all([shelf.load(), protocols.load(), settings.load()])

  const router = createAppRouter(createMemoryHistory())
  await router.push('/stack')
  await router.isReady()

  const wrapper = mountWithVuetify(StackView, {
    global: { plugins: [pinia, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, log: useLogStore() }
}

describe('StackView', () => {
  it('renders expanded peptide cards with supply, age, schedule, in-system info, and actions', async () => {
    const pre = setActivePinia(createPinia())
    const shelf = useShelfStore(pre)
    const protocols = useProtocolsStore(pre)
    await Promise.all([shelf.load(), protocols.load()])

    const sema = await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: sema.id,
      takenAt: new Date(Date.now() - DAY_MS).toISOString(),
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await protocols.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      schedule: { kind: 'interval', everyHours: 168 },
      plannedDose: { value: 0.25, unit: 'mg' },
      course: null,
      notes: '',
    })
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
      status: 'archived',
      notes: '',
    })

    const { wrapper, log } = await mountStack()
    const card = wrapper.find('.stack-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Semaglutide')
    expect(card.text()).toContain('Due in 6 days')
    expect(card.text()).toContain('4.75 mg left')
    expect(card.text()).toContain('~19 doses')
    expect(card.text()).toContain('In system:')
    expect(card.text()).toContain('Calculate')

    const startSpy = vi.spyOn(log, 'start')
    const logBtn = card.findAll('button').find((b) => b.text().includes('Log a draw'))!
    await logBtn.trigger('click')
    expect(startSpy).toHaveBeenCalledWith('dose', { vialId: sema.id })

    const archiveToggle = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Show archived (1)'))!
    await archiveToggle.trigger('click')
    expect(wrapper.text()).toContain('BPC-157')
    expect(wrapper.text()).toContain('Archived')
  })
})
