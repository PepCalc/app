import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db'
import { useSettingsStore } from '@/stores/settings'
import { mountWithVuetify } from '../../helpers'

const { default: ReminderControls } = await import('@/components/reminders/ReminderControls.vue')

let pinia: ReturnType<typeof createPinia>

beforeEach(async () => {
  await db.settings.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  await useSettingsStore().load()
})

describe('ReminderControls', () => {
  it('shows the time field and day-before switch in days mode when not repeating', () => {
    const wrapper = mountWithVuetify(ReminderControls, {
      props: { subjectId: 's-1', mode: 'days', repeating: false, hasDue: true },
      global: { plugins: [pinia] },
    })
    expect(wrapper.find('input[type="time"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Also remind me the day before')
    expect(wrapper.text()).not.toContain('Remind me')
  })

  it('hides the day-before switch in days mode when repeating', () => {
    const wrapper = mountWithVuetify(ReminderControls, {
      props: { subjectId: 's-1', mode: 'days', repeating: true, hasDue: true },
      global: { plugins: [pinia] },
    })
    expect(wrapper.find('input[type="time"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Also remind me the day before')
  })

  it('shows the lead select in times mode and hides time-of-day and day-before', () => {
    const wrapper = mountWithVuetify(ReminderControls, {
      props: { subjectId: 's-1', mode: 'times', hasDue: true },
      global: { plugins: [pinia] },
    })
    expect(wrapper.text()).toContain('Remind me')
    expect(wrapper.find('input[type="time"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Also remind me the day before')
  })
})
