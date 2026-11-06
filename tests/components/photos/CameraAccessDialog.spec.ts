import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import CameraAccessDialog from '@/components/photos/CameraAccessDialog.vue'
import type { CameraAccess } from '@/services/photos/cameraAccess'
import { mountWithVuetify } from '../../helpers'

/* The overlay needs a real viewport; what matters here is what the dialog says and offers. */
const open = (access: CameraAccess) =>
  mountWithVuetify(CameraAccessDialog, {
    props: { access, modelValue: true },
    global: {
      stubs: {
        VDialog: {
          setup:
            (_, { slots }) =>
            () =>
              h('div', slots.default?.()),
        },
      },
    },
  })

type Dialog = ReturnType<typeof open>
const press = (wrapper: Dialog, name: string) =>
  wrapper
    .findAll('button')
    .find((b) => b.text().includes(name))!
    .trigger('click')

describe('CameraAccessDialog', () => {
  it('says why before asking', async () => {
    const wrapper = open('prompt')
    expect(wrapper.text()).toContain('Used only when you tap Take a photo.')
    await press(wrapper, 'Allow camera')
    expect(wrapper.emitted('allow')).toHaveLength(1)
  })

  it('lets the user decline without reaching the system', async () => {
    const wrapper = open('prompt')
    await press(wrapper, 'Not now')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.emitted('allow')).toBeUndefined()
  })

  it('offers Settings and the library after a refusal', async () => {
    const wrapper = open('denied')
    expect(wrapper.text()).toContain('Camera is off for PepCalc')
    await press(wrapper, 'Open settings')
    await press(wrapper, 'Choose a photo instead')
    expect(wrapper.emitted('settings')).toHaveLength(1)
    expect(wrapper.emitted('library')).toHaveLength(1)
  })
})
