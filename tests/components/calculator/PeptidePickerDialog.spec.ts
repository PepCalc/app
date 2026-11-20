import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import PeptidePickerDialog, {
  type PickerMode,
} from '@/components/calculator/PeptidePickerDialog.vue'
import { allPeptidesSorted } from '@/data'
import { mountWithVuetify } from '../../helpers'

function openDialog(
  props: {
    currentPeptideId?: string
    initialMode?: PickerMode
  } = {},
) {
  return mountWithVuetify(PeptidePickerDialog, {
    props: {
      modelValue: true,
      currentPeptideId: props.currentPeptideId ?? 'tirzepatide',
      initialMode: props.initialMode ?? 'all',
    },
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
}

type Picker = ReturnType<typeof openDialog>

const press = (wrapper: Picker, text: string) =>
  wrapper
    .findAll('button')
    .find((b) => b.text().trim() === text)!
    .trigger('click')

describe('PeptidePickerDialog', () => {
  it('lists every catalog peptide alphabetically and filters by name or alias', async () => {
    const wrapper = openDialog()
    const items = wrapper.findAll('.v-list-item')
    expect(items).toHaveLength(allPeptidesSorted.length)
    expect(items[0]!.text()).toContain('AHK-Cu')

    const search = wrapper.find('input')
    await search.setValue('LY3841136')
    const filtered = wrapper.findAll('.v-list-item')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.text()).toContain('Eloralintide')

    await filtered[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['eloralintide']])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('lets the user create a custom single peptide', async () => {
    const wrapper = openDialog({ initialMode: 'custom' })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('Epitalon')
    await inputs[1]!.setValue('10')
    await press(wrapper, 'Use custom peptide')

    expect(wrapper.emitted('selectCustom')).toEqual([
      [{ name: 'Epitalon', vialUnit: 'mg', vialAmount: 10 }],
    ])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('lets the user build a custom blend and links catalog components', async () => {
    const wrapper = openDialog({ initialMode: 'blend' })
    const inputs = wrapper.findAll('input')
    // inputs: [blend name, comp 1 name, comp 1 amount, comp 2 name, comp 2 amount]
    await inputs[0]!.setValue('Copper Recovery')
    await inputs[1]!.setValue('GHK-Cu')
    await inputs[2]!.setValue('50')
    await inputs[3]!.setValue('Custom X')
    await inputs[4]!.setValue('10')
    await press(wrapper, 'Use custom blend')

    expect(wrapper.emitted('selectCustomBlend')).toEqual([
      [
        {
          name: 'Copper Recovery',
          components: [
            { name: 'GHK-Cu', amountMg: 50, peptideId: 'ghk-cu' },
            { name: 'Custom X', amountMg: 10, peptideId: null },
          ],
        },
      ],
    ])
  })
})
