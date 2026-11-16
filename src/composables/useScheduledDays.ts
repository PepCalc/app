import { computed, type ComputedRef, type Ref } from 'vue'
import { slots } from '@/domain/schedule'
import { atLocalTime, formatTime, localCalendar, monthStartOf, monthYearOf } from '@/services/time'
import { useProtocolsStore } from '@/stores/protocols'

export interface ScheduledDose {
  at: number
  label: string
}

/**
 * Doses scheduled in `[from, to)` from today onward, plus the latest selectable calendar day
 * (three months ahead). Protocols without an active vial or `asNeeded` produce nothing.
 */
export function useScheduledDays(now: Ref<number>): {
  scheduledIn: (from: number, to: number) => ScheduledDose[]
  lastSelectable: ComputedRef<number>
} {
  const protocols = useProtocolsStore()

  const lastSelectable = computed(() => {
    const todayStart = atLocalTime(now.value, 0, 0, 0)
    const ym = monthYearOf(todayStart)
    return atLocalTime(monthStartOf(ym.year, ym.month + 4), -1, 0, 0)
  })

  function scheduledIn(from: number, to: number): ScheduledDose[] {
    const todayStart = atLocalTime(now.value, 0, 0, 0)
    const effectiveFrom = Math.max(from, todayStart)
    if (!(effectiveFrom < to)) return []

    const items: ScheduledDose[] = []
    for (const protocol of protocols.sorted) {
      if (!protocols.hasVial(protocol)) continue
      const name = protocols.nameFor(protocol)
      if (protocol.schedule.kind === 'interval') {
        const due = protocols.nextDueOf(protocol, now.value)
        if (due !== null && due >= effectiveFrom && due < to) {
          items.push({ at: due, label: `${name} at ${formatTime(due)}` })
        }
        continue
      }
      if (protocol.schedule.kind === 'asNeeded') continue
      for (const at of slots(protocol.schedule, effectiveFrom, to, localCalendar)) {
        items.push({ at, label: `${name} at ${formatTime(at)}` })
      }
    }
    return items.sort((a, b) => a.at - b.at)
  }

  return { scheduledIn, lastSelectable }
}
