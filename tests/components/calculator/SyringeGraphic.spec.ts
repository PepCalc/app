import { describe, expect, it } from 'vitest'
import SyringeGraphic from '@/components/calculator/SyringeGraphic.vue'
import { findSyringe } from '@/data'
import { mountWithVuetify } from '../../helpers'

describe('SyringeGraphic', () => {
  it('describes the reading for screen readers', () => {
    const wrapper = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.1 },
    })
    expect(wrapper.find('svg').attributes('aria-label')).toBe(
      'U-100 insulin, 1 mL (100 units), filled to 10 units of 100 units',
    )
  })

  it('draws one tick per graduation and numbers every major mark', () => {
    const wrapper = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-0.3ml'), volumeMl: 0.1 },
    })
    expect(wrapper.findAll('.syringe__ticks line')).toHaveLength(31)
    expect(wrapper.findAll('.syringe__labels text').map((t) => t.text())).toEqual([
      '0',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
    ])
  })

  it('says when the draw exceeds capacity', () => {
    const wrapper = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-0.3ml'), volumeMl: 0.5 },
    })
    expect(wrapper.find('svg').attributes('aria-label')).toContain('exceeds')
    expect(wrapper.find('.syringe__reading').text()).toBe('exceeds 30 units')
  })

  it('tints the liquid blue when solutionColor is blue and defaults to clear', () => {
    const clear = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.2 },
    })
    expect(clear.find('figure').attributes('data-solution')).toBe('clear')
    expect(clear.find('figure').classes()).toContain('syringe--clear')

    const blue = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.2, solutionColor: 'blue' },
    })
    expect(blue.find('figure').attributes('data-solution')).toBe('blue')
    expect(blue.find('figure').classes()).toContain('syringe--blue')
  })

  it('draws no needle or plunger unless realistic', () => {
    const simple = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.2 },
    })
    expect(simple.find('figure').classes()).toContain('syringe--simple')
    for (const part of ['needle-group', 'rod-group', 'stopper', 'thumb-group']) {
      expect(simple.find(`.syringe__${part}`).exists()).toBe(false)
    }
    expect(simple.find('.syringe__fill').exists()).toBe(true)

    const realistic = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.2, realistic: true },
    })
    expect(realistic.find('figure').classes()).not.toContain('syringe--simple')
    for (const part of ['needle-group', 'rod-group', 'stopper', 'thumb-group']) {
      expect(realistic.find(`.syringe__${part}`).exists()).toBe(true)
    }
  })

  it('keeps the plunger handle fixed across different drawn volumes', () => {
    const low = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.1, realistic: true },
    })
    const high = mountWithVuetify(SyringeGraphic, {
      props: { syringe: findSyringe('u100-1ml'), volumeMl: 0.9, realistic: true },
    })
    expect(low.find('.syringe__thumb').attributes('x')).toBe(
      high.find('.syringe__thumb').attributes('x'),
    )
  })
})
