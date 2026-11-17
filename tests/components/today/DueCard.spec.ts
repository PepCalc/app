import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import DueCard from '@/components/today/DueCard.vue'
import type { LevelTrace } from '@/domain/projection'
import { mountWithVuetify } from '../../helpers'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'today', component: { template: '<div />' } },
      { path: '/medications/:id', name: 'medication', component: { template: '<div />' } },
    ],
  })
}

const sampleTrace: LevelTrace = {
  past: [
    [0, 0.2],
    [0.4, 0.6],
  ],
  future: [
    [0.4, 0.6],
    [1, 0.8],
  ],
  now: [0.4, 0.6],
}

describe('DueCard', () => {
  it('links the title and open button to the target route, renders slots, and emits log', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mountWithVuetify(DueCard, {
      props: {
        title: 'Zepbound',
        dueLabel: 'Due in 3 days',
        detail: 'Last: 7.5 mg, Nov 9',
        to: { name: 'medication', params: { id: 'm1' } },
      },
      slots: {
        countdown: '<span data-testid="ring">3 d</span>',
        actions: '<button type="button">Calculate</button>',
      },
      global: { plugins: [router] },
    })

    const link = wrapper.find('a.due-card__title')
    expect(link.text()).toBe('Zepbound')
    expect(link.attributes('href')).toBe('/medications/m1')
    const openButton = wrapper.find('a.due-card__open')
    expect(openButton.attributes('href')).toBe('/medications/m1')
    expect(wrapper.find('[data-testid="ring"]').text()).toBe('3 d')
    expect(wrapper.text()).toContain('Calculate')
    expect(wrapper.text()).toContain('Due in 3 days')
    expect(wrapper.text()).toContain('Last: 7.5 mg, Nov 9')

    const logButton = wrapper.findAll('button').find((b) => /Log (dose|a draw)/.test(b.text()))!
    await logButton.trigger('click')
    expect(wrapper.emitted('log')).toHaveLength(1)
  })

  it('renders estimated level telemetry, user-supplied badge, and background trace when present', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mountWithVuetify(DueCard, {
      props: {
        title: 'Custom peptide',
        dueLabel: 'In your system',
        dueTone: 'brand',
        detail: 'Last: 1 mg, today',
        to: { name: 'medication', params: { id: 'm2' } },
        trace: sampleTrace,
        level: {
          amountText: '0.72 mg',
          percentOfPeak: 85,
          stat: { label: 'Steady by', value: 'Dec 4' },
          userSupplied: true,
        },
        canLog: false,
      },
      global: { plugins: [router] },
    })

    expect(wrapper.find('.level-backdrop').exists()).toBe(true)
    expect(wrapper.text()).toContain('0.72 mg')
    expect(wrapper.text()).toContain('85%')
    expect(wrapper.text()).toContain('Steady by')
    expect(wrapper.text()).toContain('Dec 4')
    expect(wrapper.text()).toContain('Your values')
    expect(wrapper.findAll('button').some((b) => /Log (dose|a draw)/.test(b.text()))).toBe(false)
  })
})
