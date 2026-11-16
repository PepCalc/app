import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import DueCard from '@/components/today/DueCard.vue'
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

describe('DueCard', () => {
  it('links the title to the target route, renders slots, and emits log', async () => {
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
    expect(wrapper.find('[data-testid="ring"]').text()).toBe('3 d')
    expect(wrapper.text()).toContain('Calculate')
    expect(wrapper.text()).toContain('Due in 3 days')
    expect(wrapper.text()).toContain('Last: 7.5 mg, Nov 9')

    const logButton = wrapper.findAll('button').find((b) => /Log (dose|a draw)/.test(b.text()))!
    await logButton.trigger('click')
    expect(wrapper.emitted('log')).toHaveLength(1)
  })
})
