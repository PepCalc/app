import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import PresetPicker from '@/components/common/PresetPicker.vue'
import { mountWithVuetify } from '../../helpers'

function mountPicker(modelValue: number | null, presets: number[]) {
  const wrapper = mountWithVuetify(PresetPicker, {
    props: {
      label: 'Dose',
      presets,
      unitLabel: 'mcg',
      inputId: 'dose',
      modelValue,
      'onUpdate:modelValue': (v: number | null) => wrapper.setProps({ modelValue: v }),
    },
  })
  return wrapper
}

const pressed = (wrapper: ReturnType<typeof mountPicker>) =>
  wrapper.findAll('button[aria-pressed="true"]').map((b) => b.text())

describe('PresetPicker', () => {
  it('marks the preset matching the value', () => {
    expect(pressed(mountPicker(500, [250, 500]))).toEqual(['500 mcg'])
  })

  it('emits the preset value when a chip is tapped', async () => {
    const wrapper = mountPicker(250, [250, 500])
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '500 mcg')!
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([500])
  })

  it('stays on presets when presets and value change in the same tick', async () => {
    // Switching product swaps both the preset list and the default dose at once.
    const wrapper = mountPicker(0.25, [0.25, 0.5])
    await wrapper.setProps({ presets: [250, 500], modelValue: 250 })
    await nextTick()
    expect(pressed(wrapper)).toEqual(['250 mcg'])
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('shows the custom field for a value that is not a preset', async () => {
    const wrapper = mountPicker(333, [250, 500])
    await nextTick()
    expect(pressed(wrapper)).toEqual(['Custom'])
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('333')
  })

  it('shows the input directly when no presets exist and clears when model resets to null', async () => {
    const wrapper = mountPicker(null, [])
    await nextTick()
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('input').exists()).toBe(true)

    await wrapper.find('input').setValue('2.5')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2.5])

    await wrapper.setProps({ modelValue: null })
    await nextTick()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })
})
