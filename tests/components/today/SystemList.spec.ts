import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import SystemList, { type SystemRow } from '@/components/today/SystemList.vue'
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

const rows: SystemRow[] = [
  {
    key: 'tirz',
    label: 'Tirzepatide',
    amountText: '5.9 mg',
    percentOfPeak: 62,
    trace: [
      [0, 0],
      [0.3, 1],
      [1, 0.2],
    ],
    to: { name: 'medication', params: { id: 'm1' } },
  },
  {
    key: 'sema',
    label: 'Semaglutide',
    amountText: '4.1 mg',
    percentOfPeak: 88,
    trace: [
      [0, 0.2],
      [0.5, 1],
      [1, 0.4],
    ],
    to: { name: 'medication', params: { id: 'm2' } },
  },
]

describe('SystemList', () => {
  it('renders one linked row per entry with Estimate and the model badge', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mountWithVuetify(SystemList, {
      props: { rows },
      global: { plugins: [router] },
    })

    expect(wrapper.text()).toContain('In your system')
    expect(wrapper.text()).toContain('Estimate')
    expect(wrapper.text()).toContain('Modelling choice')
    expect(wrapper.text()).toContain("Sources on each medicine's page.")

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]!.attributes('href')).toBe('/medications/m1')
    expect(links[0]!.text()).toContain('Tirzepatide')
    expect(links[0]!.text()).toContain('5.9 mg')
    expect(links[0]!.text()).toContain('62% of peak')
    expect(links[0]!.find('svg.system-row__trace').exists()).toBe(true)
  })

  it('renders nothing when there are no rows', () => {
    const wrapper = mountWithVuetify(SystemList, { props: { rows: [] } })
    expect(wrapper.text()).toBe('')
  })
})
