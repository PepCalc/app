import { describe, expect, it } from 'vitest'
import LevelBackdrop from '@/components/charts/LevelBackdrop.vue'
import type { LevelTrace } from '@/domain/projection'
import { mountWithVuetify } from '../../helpers'

const trace: LevelTrace = {
  past: [
    [0, 0.2],
    [0.4, 0.5],
  ],
  future: [
    [0.4, 0.5],
    [1, 0.8],
  ],
  now: [0.4, 0.5],
}

describe('LevelBackdrop', () => {
  it('is hidden from assistive technology, because the card says the same in text', () => {
    const wrapper = mountWithVuetify(LevelBackdrop, { props: { trace, active: true } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('draws history and projection as separate lines, the projection dashed', () => {
    const wrapper = mountWithVuetify(LevelBackdrop, { props: { trace, active: true } })
    const lines = wrapper.findAll('.level-backdrop__line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.classes()).not.toContain('level-backdrop__line--future')
    expect(lines[1]!.classes()).toContain('level-backdrop__line--future')
  })

  it('places the dot at now', () => {
    const wrapper = mountWithVuetify(LevelBackdrop, { props: { trace, active: true } })
    expect(wrapper.find('.level-backdrop__dot').attributes('style')).toContain('left: 40%')
  })

  it('pulses only on the card in front', () => {
    const behind = mountWithVuetify(LevelBackdrop, { props: { trace, active: false } })
    expect(behind.find('.level-backdrop__dot--live').exists()).toBe(false)
  })
})
