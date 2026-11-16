import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { db, repository } from '@/db'
import { useNotifyStore } from '@/stores/notify'
import { mountWithVuetify } from '../../helpers'
import { fakeNative } from '../fakeNative'

vi.mock(
  '@/services/health/nativeHealth',
  async () => (await import('../fakeNative')).fakeNative.api,
)

const { default: HealthView } = await import('@/views/HealthView.vue')
const { useHealthSyncStore } = await import('@/stores/healthSync')
const { useJournalStore } = await import('@/stores/journal')

const NOW = Date.now()
const RECENT = new Date(NOW - 3_600_000).toISOString()

let pinia: ReturnType<typeof createPinia>
const mounted: { unmount(): void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(db.tables.map((t) => t.clear()))
  fakeNative.reset()
  pinia = createPinia()
  setActivePinia(pinia)
  await Promise.all([useJournalStore().load(), useHealthSyncStore().load()])
})

async function mountView() {
  const wrapper = mountWithVuetify(HealthView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: RouterLinkStub },
    },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const button = (wrapper: Awaited<ReturnType<typeof mountView>>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().trim() === text)

describe('HealthView (native)', () => {
  it('1. shows synced count as success for one reading each way', async () => {
    fakeNative.reset([
      {
        measure: 'weight',
        at: NOW - 7_200_000,
        value: 81,
        platformId: 'scale-1',
        sourceId: 'scale',
      },
    ])
    await useJournalStore().addWeight({
      measuredAt: RECENT,
      kg: 80.4,
      enteredUnit: 'kg',
      notes: '',
    })

    const wrapper = await mountView()
    await button(wrapper, 'Turn on')!.trigger('click')

    await vi.waitFor(() =>
      expect(useNotifyStore().current).toMatchObject({
        text: 'Synced: 1 reading in, 1 out.',
        tone: 'success',
      }),
    )
  })

  it('2. shows refused write count as warning', async () => {
    fakeNative.setRefuseWrites(true)
    await useJournalStore().addWeight({
      measuredAt: RECENT,
      kg: 80.4,
      enteredUnit: 'kg',
      notes: '',
    })

    const wrapper = await mountView()
    await button(wrapper, 'Turn on')!.trigger('click')

    await vi.waitFor(() =>
      expect(useNotifyStore().current).toMatchObject({
        text: 'Synced: 0 readings in, 0 out. 1 not accepted.',
        tone: 'warning',
      }),
    )
  })

  it('3. shows Health Connect error when access rejects', async () => {
    fakeNative.setAccessError(new Error('unavailable'))

    const wrapper = await mountView()
    await button(wrapper, 'Turn on')!.trigger('click')

    await vi.waitFor(() =>
      expect(useNotifyStore().current).toMatchObject({
        text: "Couldn't reach Health Connect.",
        tone: 'error',
      }),
    )
  })

  it('4. shows warning when sync succeeds but saving the result fails', async () => {
    const wrapper = await mountView()
    await useHealthSyncStore().save({ schedule: 'once' })
    await flushPromises()

    vi.spyOn(repository, 'setSetting').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await button(wrapper, 'Sync now')!.trigger('click')

    await vi.waitFor(() =>
      expect(useNotifyStore().current).toMatchObject({
        text: "Synced. Couldn't save the result.",
        tone: 'warning',
      }),
    )
  })

  it('5. shows nothing new on a second tap while a sync is running', async () => {
    let releaseAccess: (() => void) | undefined
    fakeNative.setOnAccess(
      () =>
        new Promise<void>((resolve) => {
          releaseAccess = resolve
        }),
    )

    const wrapper = await mountView()
    await useHealthSyncStore().save({ enabled: true, schedule: 'ongoing' })
    await flushPromises()

    const notify = useNotifyStore()
    await button(wrapper, 'Sync now')!.trigger('click')
    await vi.waitFor(() => expect(releaseAccess).toBeDefined())
    expect(notify.current).toBeNull()

    await button(wrapper, 'Sync now')!.trigger('click')
    await flushPromises()
    expect(notify.current).toBeNull()

    releaseAccess!()
    await vi.waitFor(() =>
      expect(notify.current).toMatchObject({
        text: 'Synced: 0 readings in, 0 out.',
        tone: 'success',
      }),
    )
  })

  it('6. shows error and logs no unhandled rejection when unticking a reading fails to save', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = await mountView()

    vi.spyOn(repository, 'setSetting').mockRejectedValueOnce(new Error('QuotaExceededError'))
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(false)

    await vi.waitFor(() =>
      expect(useNotifyStore().current).toMatchObject({
        text: "Couldn't save. Try again.",
        tone: 'error',
      }),
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
