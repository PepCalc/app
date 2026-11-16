import { describe, expect, it } from 'vitest'
import DoseLegend from '@/components/charts/DoseLegend.vue'
import type { DoseLegendItem } from '@/domain/doseBands'
import { mountWithVuetify } from '../../helpers'

const items: DoseLegendItem[] = [
  { slot: 0, key: 'sema', label: 'Wegovy', amount: 0.5, unitLabel: 'mg' },
  { slot: 1, key: 'tirz', label: 'Zepbound', amount: 2.5, unitLabel: 'mg' },
]

describe('DoseLegend', () => {
  it('renders a list named Doses with one item per strength and aria-hidden swatches', () => {
    const wrapper = mountWithVuetify(DoseLegend, { props: { legend: items, named: false } })
    const list = wrapper.find('ul[aria-label="Doses"]')
    expect(list.exists()).toBe(true)
    const rows = list.findAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toBe('0.5 mg')
    expect(rows[1]!.text()).toBe('2.5 mg')
    const swatches = list.findAll('.pc-swatch')
    expect(swatches).toHaveLength(2)
    expect(swatches[0]!.attributes('aria-hidden')).toBe('true')
    expect(swatches[0]!.classes()).toContain('pc-swatch--dose-1')
    expect(swatches[1]!.classes()).toContain('pc-swatch--dose-2')
  })

  it('includes medicine names when named is true', () => {
    const wrapper = mountWithVuetify(DoseLegend, { props: { legend: items, named: true } })
    const rows = wrapper.findAll('li')
    expect(rows[0]!.text()).toBe('Wegovy 0.5 mg')
    expect(rows[1]!.text()).toBe('Zepbound 2.5 mg')
  })
})
