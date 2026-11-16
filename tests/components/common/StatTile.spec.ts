import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import StatTile from '@/components/common/StatTile.vue'
import { mountWithVuetify } from '../../helpers'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'today', component: { template: '<div />' } },
      { path: '/progress', name: 'progress', component: { template: '<div />' } },
    ],
  })
}

describe('StatTile', () => {
  it('renders label, value, and optional note', () => {
    const wrapper = mountWithVuetify(StatTile, {
      props: { label: 'Weight', value: '82.4 kg', note: '−3.2 kg' },
    })
    expect(wrapper.text()).toContain('Weight')
    expect(wrapper.text()).toContain('82.4 kg')
    expect(wrapper.text()).toContain('−3.2 kg')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders as a router link when to is given', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mountWithVuetify(StatTile, {
      props: {
        label: 'BMI',
        value: '27.1',
        note: 'Above the healthy range',
        to: { name: 'progress' },
      },
      global: { plugins: [router] },
    })
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/progress')
  })
})
