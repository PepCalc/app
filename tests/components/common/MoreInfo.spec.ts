import { describe, expect, it } from 'vitest'
import MoreInfo from '@/components/common/MoreInfo.vue'
import { mountWithVuetify } from '../../helpers'

describe('MoreInfo', () => {
  it('starts folded and opens on tap', async () => {
    const wrapper = mountWithVuetify(MoreInfo, {
      slots: { default: '<p>How this is estimated</p>' },
    })
    const toggle = wrapper.get('button')
    expect(toggle.text()).toBe('More information')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    const panel = wrapper.get(`#${toggle.attributes('aria-controls')}`)
    expect(panel.text()).toBe('How this is estimated')
    expect(panel.attributes('style')).toContain('display: none')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(panel.attributes('style') ?? '').not.toContain('display: none')
  })
})
