import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '@/domain/entries'
import { LOG_KINDS } from '@/logKinds'
import { useLogStore } from '@/stores/log'
import EntriesTimeline from '@/components/journal/EntriesTimeline.vue'
import { mountWithVuetify } from '../../helpers'

const dosePlural = LOG_KINDS.find((k) => k.kind === 'dose')!.plural

function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'kind' | 'at'>): Entry {
  return {
    title: overrides.id,
    detail: '',
    notes: '',
    ...overrides,
  }
}

describe('EntriesTimeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows counts on chips and hides kinds with zero entries', () => {
    const entries = [
      makeEntry({ id: 'd1', kind: 'dose', at: new Date(2026, 10, 16, 8, 10).getTime() }),
      makeEntry({ id: 'w1', kind: 'weight', at: new Date(2026, 10, 16, 7, 55).getTime() }),
      makeEntry({ id: 'w2', kind: 'weight', at: new Date(2026, 10, 15, 7, 55).getTime() }),
    ]
    const wrapper = mountWithVuetify(EntriesTimeline, {
      props: { entries },
      global: { plugins: [createPinia()] },
    })

    const chips = wrapper.findAll('button.v-chip')
    expect(chips.map((c) => c.text().replace(/\s+/g, ' ').trim())).toEqual([
      'All 3',
      `${dosePlural} 1`,
      'Weight 2',
    ])
  })

  it('filters to Weight and updates aria-pressed when Weight chip is pressed', async () => {
    const entries = [
      makeEntry({
        id: 'd1',
        kind: 'dose',
        at: new Date(2026, 10, 16, 8, 10).getTime(),
        title: '7.5 mg Zepbound',
      }),
      makeEntry({
        id: 'w1',
        kind: 'weight',
        at: new Date(2026, 10, 16, 7, 55).getTime(),
        title: '82.4 kg',
      }),
    ]
    const wrapper = mountWithVuetify(EntriesTimeline, {
      props: { entries },
      global: { plugins: [createPinia()] },
    })

    const weightChip = wrapper.findAll('button.v-chip').find((c) => c.text().includes('Weight'))!
    expect(weightChip.attributes('aria-pressed')).toBe('false')
    await weightChip.trigger('click')

    expect(weightChip.attributes('aria-pressed')).toBe('true')
    const allChip = wrapper.findAll('button.v-chip').find((c) => c.text().includes('All'))!
    expect(allChip.attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('82.4 kg')
    expect(wrapper.text()).not.toContain('7.5 mg Zepbound')
  })

  it('renders day headings once per day in order', () => {
    const entries = [
      makeEntry({ id: 'd1', kind: 'dose', at: new Date(2026, 10, 16, 8, 10).getTime() }),
      makeEntry({ id: 'w1', kind: 'weight', at: new Date(2026, 10, 16, 7, 55).getTime() }),
      makeEntry({ id: 's1', kind: 'symptom', at: new Date(2026, 10, 15, 19, 30).getTime() }),
    ]
    const wrapper = mountWithVuetify(EntriesTimeline, {
      props: { entries },
      global: { plugins: [createPinia()] },
    })

    expect(wrapper.findAll('h3')).toHaveLength(2)
  })

  it('calls log.edit with kind and id when a row is clicked', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const log = useLogStore()
    const edit = vi.spyOn(log, 'edit')

    const entries = [
      makeEntry({
        id: 'w42',
        kind: 'weight',
        at: new Date(2026, 10, 16, 7, 55).getTime(),
        title: '82.4 kg',
      }),
    ]
    const wrapper = mountWithVuetify(EntriesTimeline, {
      props: { entries },
      global: { plugins: [pinia] },
    })

    const row = wrapper.find('button.entry-row')
    await row.trigger('click')
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'weight', id: 'w42' }))
  })

  it('pages at ten rows and respects compact mode with limit', () => {
    const base = new Date(2026, 10, 16, 12, 0).getTime()
    const entries = Array.from({ length: 11 }, (_, i) =>
      makeEntry({ id: `w${i}`, kind: 'weight', at: base - i * 60_000, title: `Row ${i}` }),
    )

    const full = mountWithVuetify(EntriesTimeline, {
      props: { entries },
      global: { plugins: [createPinia()] },
    })
    expect(full.findAll('button.entry-row')).toHaveLength(10)
    expect(full.find('.v-pagination').exists()).toBe(true)

    const compact = mountWithVuetify(EntriesTimeline, {
      props: { entries, compact: true, limit: 5 },
      global: { plugins: [createPinia()] },
    })
    expect(compact.findAll('button.entry-row')).toHaveLength(5)
    expect(compact.find('.v-pagination').exists()).toBe(false)
    expect(compact.findAll('button.v-chip')).toHaveLength(0)
  })

  it('shows empty copy when there are no entries', () => {
    const wrapper = mountWithVuetify(EntriesTimeline, {
      props: { entries: [] },
      global: { plugins: [createPinia()] },
    })
    expect(wrapper.text()).toContain('Nothing logged yet.')
  })
})
