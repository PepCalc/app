import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import { useScheduledDays } from '@/composables/useScheduledDays'
import { atLocalTime } from '@/services/time'

// Monday Nov 16, 2026 12:00 local.
const NOW = new Date(2026, 10, 16, 12, 0).getTime()

describe('useScheduledDays (PepCalc)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('returns weekly slots from today onward, one interval time, and ignores protocols without a vial', async () => {
    const shelf = useShelfStore()
    const protocols = useProtocolsStore()
    await Promise.all([shelf.load(), protocols.load()])

    await shelf.addVial({
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single',
      amount: 5,
      unit: 'mg',
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: new Date(2026, 10, 1, 8, 0).toISOString(),
      status: 'active',
      notes: '',
    })
    const semaVial = await shelf.addVial({
      peptideId: 'semaglutide',
      name: 'Semaglutide',
      kind: 'single',
      amount: 5,
      unit: 'mg',
      diluentMl: 2,
      components: null,
      typicalDose: null,
      pkOverride: null,
      reconstitutedAt: new Date(2026, 10, 1, 8, 0).toISOString(),
      status: 'active',
      notes: '',
    })
    await shelf.addDraw({
      vialId: semaVial.id,
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      takenAt: new Date(2026, 10, 15, 9, 0).toISOString(),
      notes: '',
    })

    // Weekly protocol: Wednesdays (3) and Fridays (5) at 08:00.
    await protocols.addProtocol({
      key: 'bpc-157',
      name: 'BPC-157',
      schedule: { kind: 'weekly', days: [3, 5], times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })
    // Interval protocol: every 7 days (168h) from Nov 15 09:00 -> Nov 22 09:00.
    await protocols.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      schedule: { kind: 'interval', everyHours: 168 },
      plannedDose: null,
      course: null,
      notes: '',
    })
    // Protocol without any vial -> ignored.
    await protocols.addProtocol({
      key: 'tb-500',
      name: 'TB-500',
      schedule: { kind: 'daily', times: [{ hour: 8, minute: 0 }] },
      plannedDose: null,
      course: null,
      notes: '',
    })

    const { scheduledIn, lastSelectable } = useScheduledDays(ref(NOW))
    const inMonth = scheduledIn(new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime())

    // Remaining Wednesdays & Fridays in Nov 2026 from Nov 16: 18, 20, 25, 27 (4 slots) + Nov 22 Semaglutide = 5.
    const days = inMonth.map((s) => new Date(s.at).getDate())
    expect(days).toEqual([18, 20, 22, 25, 27])
    expect(inMonth.every((s) => s.at >= atLocalTime(NOW, 0, 0, 0))).toBe(true)
    expect(inMonth[0]!.label).toContain('BPC-157 at')
    expect(inMonth[2]!.label).toContain('Semaglutide at')

    // Three months ahead: end of Feb 2027.
    expect(lastSelectable.value).toBe(new Date(2027, 1, 28, 0, 0, 0, 0).getTime())
  })
})
