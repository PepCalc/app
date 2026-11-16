import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db'
import type { ScheduledReminder } from '@/services/reminders/nativeReminders'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'

const scheduleMock = vi.hoisted(() => vi.fn<(reminders: ScheduledReminder[]) => Promise<void>>())

vi.mock('@/services/reminders/nativeReminders', () => ({
  scheduleReminders: scheduleMock,
  checkAccess: vi.fn(async () => 'granted'),
  requestAccess: vi.fn(async () => 'granted'),
  openSettings: vi.fn(async () => {}),
  onReminderTap: vi.fn(async () => {}),
}))

const { useReminderSync } = await import('@/composables/useReminderSync')

const SyncHost = defineComponent({
  setup() {
    useReminderSync()
    return () => null
  },
})

let pinia: ReturnType<typeof createPinia>
const mounted: { unmount(): void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Monday Nov 16, 2026 at 07:00 local time.
  vi.setSystemTime(new Date(2026, 10, 16, 7, 0, 0))
  await Promise.all(db.tables.map((t) => t.clear()))
  scheduleMock.mockReset().mockResolvedValue()
  pinia = createPinia()
  setActivePinia(pinia)
  await Promise.all([useShelfStore().load(), useProtocolsStore().load(), useSettingsStore().load()])
})

async function mountSync() {
  const wrapper = mount(SyncHost, { global: { plugins: [pinia] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function seedPeptide(peptideId: string, name: string) {
  const shelf = useShelfStore()
  return shelf.addVial({
    peptideId,
    name,
    kind: 'single',
    unit: 'mcg',
    amount: 5000,
    diluentMl: 2,
    components: null,
    typicalDose: { value: 250, unit: 'mcg' },
    pkOverride: null,
    reconstitutedAt: new Date(2026, 10, 15, 8, 0, 0).toISOString(),
    status: 'active',
    notes: '',
  })
}

describe('useReminderSync (native)', () => {
  it('1. schedules 14 reminders for 7 days for a twice-daily protocol with reminder on', async () => {
    await seedPeptide('bpc-157', 'BPC-157')
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    const p = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: {
        kind: 'daily',
        times: [
          { hour: 8, minute: 0 },
          { hour: 20, minute: 0 },
        ],
      },
      plannedDose: null,
      course: null,
      notes: '',
    })
    await settings.setReminder(p.id, { enabled: true })

    await mountSync()
    const latest = scheduleMock.mock.calls.at(-1)?.[0]
    expect(latest).toHaveLength(14)
    expect(latest![0]!.at).toBe(new Date(2026, 10, 16, 8, 0, 0).getTime())
  })

  it('2. groups two protocols due in the same minute into one notification per time', async () => {
    await seedPeptide('bpc-157', 'BPC-157')
    await seedPeptide('tb-500', 'TB-500')
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    const p1 = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    const p2 = await protocols.addProtocol({
      key: 'tb-500',
      name: 'TB-500',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    await settings.setReminder(p1.id, { enabled: true })
    await settings.setReminder(p2.id, { enabled: true })

    await mountSync()
    const latest = scheduleMock.mock.calls.at(-1)?.[0]
    expect(latest).toHaveLength(7)
    expect(latest![0]!.subjectIds).toHaveLength(2)
    expect(latest![0]!.title).toBe('2 doses due')
  })

  it('3. caps five twice-daily protocols at different minutes to 60 pending reminders', async () => {
    const peptides = [
      ['bpc-157', 'BPC-157'],
      ['tb-500', 'TB-500'],
      ['ghk-cu', 'GHK-Cu'],
      ['kpv', 'KPV'],
      ['semaglutide', 'Semaglutide'],
    ] as const
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    for (let i = 0; i < peptides.length; i++) {
      const [key, name] = peptides[i]!
      await seedPeptide(key, name)
      const p = await protocols.addProtocol({
        key,
        name,
        schedule: {
          kind: 'daily',
          times: [
            { hour: 8, minute: i * 5 },
            { hour: 20, minute: i * 5 },
          ],
        },
        plannedDose: null,
        course: null,
        notes: '',
      })
      await settings.setReminder(p.id, { enabled: true })
    }

    await mountSync()
    const latest = scheduleMock.mock.calls.at(-1)?.[0]
    expect(latest).toHaveLength(60)
  })

  it('4. re-plans with a later first time after logging a draw', async () => {
    const vial = await seedPeptide('bpc-157', 'BPC-157')
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    const p = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: {
        kind: 'daily',
        times: [
          { hour: 8, minute: 0 },
          { hour: 20, minute: 0 },
        ],
      },
      plannedDose: null,
      course: null,
      notes: '',
    })
    await settings.setReminder(p.id, { enabled: true })

    await mountSync()
    const callsBefore = scheduleMock.mock.calls.length
    const firstBefore = scheduleMock.mock.calls.at(-1)![0]![0]!.at
    expect(firstBefore).toBe(new Date(2026, 10, 16, 8, 0, 0).getTime())

    await useShelfStore().addDraw({
      vialId: vial.id,
      takenAt: new Date(2026, 10, 16, 6, 45, 0).toISOString(),
      dose: { value: 250, unit: 'mcg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await flushPromises()

    expect(scheduleMock.mock.calls.length).toBeGreaterThan(callsBefore)
    const firstAfter = scheduleMock.mock.calls.at(-1)![0]![0]!.at
    expect(firstAfter).toBe(new Date(2026, 10, 16, 20, 0, 0).getTime())
  })

  it('5. schedules nothing for a protocol whose vial was deleted', async () => {
    const vial = await seedPeptide('bpc-157', 'BPC-157')
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    const p = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    await settings.setReminder(p.id, { enabled: true })

    await mountSync()
    expect(scheduleMock.mock.calls.at(-1)?.[0]).toHaveLength(7)

    await useShelfStore().deleteVial(vial.id)
    await flushPromises()
    expect(scheduleMock.mock.calls.at(-1)?.[0]).toEqual([])
  })

  it('6. schedules nothing when the reminder is off', async () => {
    await seedPeptide('bpc-157', 'BPC-157')
    await useProtocolsStore().addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })

    await mountSync()
    expect(scheduleMock.mock.calls.at(-1)?.[0]).toEqual([])
  })

  it('7. never puts a peptide name in title or body when names are off', async () => {
    await seedPeptide('bpc-157', 'BPC-157')
    await seedPeptide('tb-500', 'TB-500')
    const protocols = useProtocolsStore()
    const settings = useSettingsStore()
    const p1 = await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    const p2 = await protocols.addProtocol({
      key: 'tb-500',
      name: 'TB-500',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    const p3 = await seedPeptide('ghk-cu', 'GHK-Cu').then(() =>
      protocols.addProtocol({
        key: 'ghk-cu',
        name: 'GHK-Cu',
        schedule: { kind: 'daily', times: [{ hour: 9, minute: 0 }] },
        plannedDose: null,
        course: null,
        notes: '',
      }),
    )
    await settings.setReminder(p1.id, { enabled: true })
    await settings.setReminder(p2.id, { enabled: true })
    await settings.setReminder(p3.id, { enabled: true })

    await mountSync()
    const latest = scheduleMock.mock.calls.at(-1)?.[0] ?? []
    expect(latest.length).toBeGreaterThan(0)
    for (const r of latest) {
      for (const forbidden of ['BPC-157', 'TB-500', 'GHK-Cu']) {
        expect(r.title).not.toContain(forbidden)
        expect(r.body).not.toContain(forbidden)
      }
    }
  })
})
