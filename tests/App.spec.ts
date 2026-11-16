import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { db } from '@/db'
import { createAppRouter } from '@/router'
import App from '@/App.vue'
import { mountWithVuetify } from './helpers'

vi.mock('@/components/common/UpdatePrompt.vue', () => ({
  default: { template: '<div />' },
}))

const mounted: { unmount(): void }[] = []

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  setActivePinia(createPinia())
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

describe('App navigation', () => {
  it('shows the final five tabs in order and lights Progress on the entries page', async () => {
    const pinia = setActivePinia(createPinia())
    const router = createAppRouter(createMemoryHistory())
    await router.push('/progress/entries')
    await router.isReady()

    const wrapper = mountWithVuetify(App, {
      global: {
        plugins: [pinia, router],
        stubs: {
          AppSnackbar: true,
          AppConfirm: true,
          LogHost: true,
          UpdatePrompt: true,
          DisclaimerDialog: true,
        },
      },
    })
    mounted.push(wrapper)
    await flushPromises()

    const nav = wrapper.find('.v-bottom-navigation').exists()
      ? wrapper.find('.v-bottom-navigation')
      : wrapper.find('.rail')
    const tabs = nav.findAll('a')
    expect(tabs.map((t) => t.text())).toEqual([
      'Today',
      'Stack',
      'Calculator',
      'Progress',
      'Settings',
    ])

    const active = nav.find('.v-btn--active, .v-list-item--active')
    expect(active.text()).toBe('Progress')
  })
})
