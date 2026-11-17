import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db'
import type { Schedule } from '@/domain/schedule'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import ScheduleEditor from '@/components/protocols/ScheduleEditor.vue'
import ProtocolDialog from '@/components/protocols/ProtocolDialog.vue'
import { mountWithVuetify } from '../../helpers'

vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="v-chart-stub" />',
  },
}))

const mounted: { unmount(): void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

beforeEach(async () => {
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

function mountEditor(initial: Schedule) {
  const wrapper = mountWithVuetify(ScheduleEditor, {
    props: { modelValue: initial },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('ScheduleEditor', () => {
  it('1: renders each kind’s own fields', async () => {
    const wrapper = mountEditor({ kind: 'interval', everyHours: 24 })
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
    expect(wrapper.find('input[type="time"]').exists()).toBe(false)

    await wrapper.setProps({
      modelValue: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
    })
    expect(wrapper.find('input[type="time"]').exists()).toBe(true)
    expect(wrapper.find('[role="group"]').exists()).toBe(false)

    await wrapper.setProps({
      modelValue: { kind: 'weekly', days: [1, 3], times: [{ hour: 8, minute: 0 }] },
    })
    expect(wrapper.find('[role="group"]').exists()).toBe(true)

    await wrapper.setProps({
      modelValue: {
        kind: 'cycle',
        onDays: 5,
        offDays: 2,
        times: [{ hour: 8, minute: 0 }],
        anchor: '2026-11-16',
      },
    })
    expect(wrapper.find('input[type="date"]').exists()).toBe(true)

    await wrapper.setProps({ modelValue: { kind: 'asNeeded' } })
    expect(wrapper.text()).toContain('No due time. Your last draw still shows.')
  })

  it('2: does not offer adding a seventh time', async () => {
    const six = [6, 9, 12, 15, 18, 21].map((hour) => ({ hour, minute: 0 }))
    const wrapper = mountEditor({ kind: 'daily', times: six })
    expect(wrapper.findAll('input[type="time"]')).toHaveLength(6)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Add a time'))).toBe(false)
  })

  it('3: day buttons expose aria-pressed and full weekday names', () => {
    const wrapper = mountEditor({
      kind: 'weekly',
      days: [1, 5],
      times: [{ hour: 8, minute: 0 }],
    })
    const group = wrapper.get('[role="group"]')
    const buttons = group.findAll('button')
    expect(buttons).toHaveLength(7)
    const mon = buttons.find((b) => b.attributes('aria-label') === 'Monday')!
    const tue = buttons.find((b) => b.attributes('aria-label') === 'Tuesday')!
    const fri = buttons.find((b) => b.attributes('aria-label') === 'Friday')!
    expect(mon.attributes('aria-pressed')).toBe('true')
    expect(tue.attributes('aria-pressed')).toBe('false')
    expect(fri.attributes('aria-pressed')).toBe('true')
  })

  it('4: emits valid: false when Days selection is empty', async () => {
    const wrapper = mountEditor({
      kind: 'weekly',
      days: [1],
      times: [{ hour: 8, minute: 0 }],
    })
    const mon = wrapper
      .get('[role="group"]')
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Monday')!
    await mon.trigger('click')
    const validEvents = wrapper.emitted('valid')!
    expect(validEvents[validEvents.length - 1]).toEqual([false])
  })

  it('5: switching from Daily to Weekly/Select Days keeps the entered times', async () => {
    const wrapper = mountEditor({
      kind: 'daily',
      times: [
        { hour: 7, minute: 30 },
        { hour: 19, minute: 45 },
      ],
    })
    const vm = wrapper.vm as unknown as { $?: unknown }
    expect(vm).toBeTruthy()
    // Simulate changing kind via the select's model update
    const select = wrapper.findComponent({ name: 'VSelect' })
    expect(
      (select.props('items') as readonly { title: string; value: string }[]).map((i) => i.title),
    ).toEqual(['Daily', 'Weekly/Select Days', 'Days on, Days off', 'Every N hours', 'As Needed'])
    await select.vm.$emit('update:modelValue', 'weekly')
    await flushPromises()
    const timeValues = wrapper
      .findAll('input[type="time"]')
      .map((i) => (i.element as HTMLInputElement).value)
    expect(timeValues).toEqual(['07:30', '19:45'])
  })
})

describe('ProtocolDialog', () => {
  it('6: starts planned dose empty without dose suggestion copy and defaults to Weekly/Select Days', async () => {
    const pinia = setActivePinia(createPinia())
    const shelf = useShelfStore(pinia)
    const protocols = useProtocolsStore(pinia)
    await Promise.all([shelf.load(), protocols.load()])
    await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      unit: 'mg',
      amount: 5,
      diluentMl: 3,
      components: null,
      typicalDose: { value: 0.25, unit: 'mg' },
      pkOverride: null,
      reconstitutedAt: '2026-11-01T08:00:00.000Z',
      status: 'active',
      notes: '',
    })

    const wrapper = mountWithVuetify(ProtocolDialog, {
      props: {
        modelValue: true,
        protocol: null,
        products: [{ key: 'semaglutide', name: 'Semaglutide' }],
      },
      global: { plugins: [pinia] },
    })
    mounted.push(wrapper)
    await flushPromises()

    expect(document.body.textContent).not.toContain('Your own plan')
    expect(document.body.textContent).not.toContain("doesn't suggest doses")
    expect(document.body.querySelector('[role="group"][aria-labelledby]')?.textContent).toBeTruthy()
    expect(document.body.textContent).toContain('Glute, left')
    expect(document.body.textContent).toContain('Glute, right')

    const labels = [...document.body.querySelectorAll('label')]
    const plannedLabel = labels.find(
      (l) => l.getAttribute('for') && l.textContent?.includes('Planned dose'),
    )
    expect(plannedLabel).toBeDefined()
    const input = document.getElementById(plannedLabel!.getAttribute('for')!) as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('')
  })

  it('7: edits a reactive ProtocolRow without throwing DataCloneError and saves site mode', async () => {
    const pinia = setActivePinia(createPinia())
    const shelf = useShelfStore(pinia)
    const protocols = useProtocolsStore(pinia)
    await Promise.all([shelf.load(), protocols.load()])
    const row = reactive({
      id: 'p1',
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: {
        kind: 'weekly' as const,
        days: [1 as const, 3 as const, 5 as const],
        times: [{ hour: 8, minute: 0 }],
      },
      plannedDose: { value: 250, unit: 'mcg' as const },
      course: { startOn: '2026-11-16', weeks: 8 },
      site: 'glute-left' as const,
      siteMode: 'rotate' as const,
      notes: 'test',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    })

    const wrapper = mountWithVuetify(ProtocolDialog, {
      props: {
        modelValue: true,
        protocol: row,
        products: [{ key: 'bpc-157', name: 'BPC-157' }],
        name: 'BPC-157',
      },
      global: { plugins: [pinia] },
    })
    mounted.push(wrapper)
    await flushPromises()

    const saveBtn = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save'),
    )!
    expect(saveBtn.disabled).toBe(false)
    saveBtn.click()
    await flushPromises()

    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      site: 'glute-left',
      siteMode: 'rotate',
    })
  })
})
