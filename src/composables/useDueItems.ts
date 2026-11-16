import { computed, type ComputedRef, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { sortDue, type DueItem } from '@/domain/due'
import { formatQuantity } from '@/domain/units'
import { formatDay, toEpochMs } from '@/services/time'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'

export interface PepCalcDueItem extends DueItem {
  gapHours: number
  asNeeded: boolean
  vialId: string | null
  to: RouteLocationRaw
  log: () => void
}

/** Scheduled peptides that still have a vial, soonest due first. */
export function useDueItems(now: Ref<number>): {
  items: ComputedRef<PepCalcDueItem[]>
} {
  const protocols = useProtocolsStore()
  const log = useLogStore()

  const items = computed<PepCalcDueItem[]>(() =>
    sortDue(
      protocols.sorted
        .filter((p) => protocols.hasVial(p))
        .map((p) => {
          const last = protocols.lastDrawOf(p)
          const parts: string[] = []
          if (p.plannedDose) parts.push(`Planned: ${formatQuantity(p.plannedDose)}`)
          if (last) {
            const day = formatDay(toEpochMs(last.takenAt), now.value)
            const when = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
            parts.push(`Last: ${formatQuantity(last.dose)}, ${when}`)
          } else if (!p.plannedDose) {
            parts.push('No doses yet')
          }
          const dueAt = protocols.nextDueOf(p, now.value)
          const vialId = protocols.drawVialOf(p)?.id ?? null
          return {
            id: p.id,
            title: protocols.nameFor(p),
            detail: parts.join(' · '),
            dueAt,
            gapHours: dueAt !== null ? protocols.gapOf(p, dueAt) : 0,
            asNeeded: p.schedule.kind === 'asNeeded',
            vialId,
            to: { name: 'peptide', params: { key: p.key } },
            log: () => log.start('dose', { vialId: vialId ?? undefined }),
          }
        }),
    ),
  )

  return { items }
}
