import { computed, type ComputedRef, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { dueToneFor, sortDue, type DueItem, type DueTone } from '@/domain/due'
import { anyDoseInEffect, levelNow } from '@/domain/pk'
import { levelTrace, projectLevels, type LevelTrace } from '@/domain/projection'
import { dueState, dueText, lastDrawFor, projectedDoseTimes } from '@/domain/schedule'
import { formatAmount, formatQuantity, unitLabel } from '@/domain/units'
import { sameProductKey } from '@/domain/vials'
import { formatDay, formatHours, localCalendar, toEpochMs } from '@/services/time'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import { outlookStat } from '@/components/charts/projectionText'
import type { DueCardLevel } from '@/components/today/DueCard.vue'

export interface PepCalcDueItem extends DueItem {
  gapHours: number
  asNeeded: boolean
  dueLabel?: string
  dueTone?: DueTone
  vialId: string | null
  trace: LevelTrace | null
  level: DueCardLevel | null
  canLog: boolean
  scheduled: boolean
  to: RouteLocationRaw
  log: () => void
}

/**
 * Scheduled peptides (soonest due first) plus any unscheduled peptide with doses still in the
 * body, each carrying its estimated-level trace and readings when a half-life is configured.
 */
export function useDueItems(now: Ref<number>): {
  items: ComputedRef<PepCalcDueItem[]>
} {
  const protocols = useProtocolsStore()
  const shelf = useShelfStore()
  const log = useLogStore()

  const items = computed<PepCalcDueItem[]>(() => {
    const coveredKeys = new Set<string>()

    const scheduledItems = sortDue(
      protocols.sorted
        .filter((p) => protocols.hasVial(p))
        .map((p) => {
          coveredKeys.add(p.key)
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
          const gapHours = dueAt !== null ? protocols.gapOf(p, dueAt) : 0
          const state = dueAt !== null ? dueState(dueAt, gapHours, now.value) : null
          const vialId = protocols.drawVialOf(p)?.id ?? null

          const levels = protocols.levelsOf(p.key)
          let trace: LevelTrace | null = null
          let level: DueCardLevel | null = null
          if (levels?.pk && levels.history.length > 0) {
            const labelUnit = unitLabel(levels.unit)
            const { amount, percentOfPeak } = levelNow(levels.history, levels.pk.params, now.value)
            const doseTimes = projectedDoseTimes(
              p.schedule,
              last ? toEpochMs(last.takenAt) : null,
              toEpochMs(p.createdAt),
              now.value,
              localCalendar,
            )
            const proj = doseTimes.length ? protocols.projectionOf(p, now.value) : null
            if (proj) {
              const stat = outlookStat(proj.projection.outlook, now.value)
              trace = levelTrace(proj.projection, now.value)
              level = {
                amountText: formatAmount(amount, labelUnit),
                percentOfPeak,
                stat: { label: stat.label, value: stat.value },
                userSupplied: proj.userSupplied,
              }
            } else if (anyDoseInEffect(levels.history, levels.pk.params, now.value)) {
              const pastProj = projectLevels({
                params: levels.pk.params,
                doseTimes: [],
                amount: levels.amount,
                history: levels.history,
                now: now.value,
              })
              trace = levelTrace(pastProj, now.value)
              level = {
                amountText: formatAmount(amount, labelUnit),
                percentOfPeak,
                stat: { label: 'Half-life', value: formatHours(levels.pk.params.halfLifeHours) },
                userSupplied: levels.pk.userSupplied,
              }
            }
          }

          return {
            id: p.id,
            title: protocols.nameFor(p),
            detail: parts.join(' · '),
            dueAt,
            gapHours,
            asNeeded: p.schedule.kind === 'asNeeded',
            dueLabel: state
              ? dueText(state)
              : p.schedule.kind === 'asNeeded'
                ? 'As needed'
                : undefined,
            dueTone: state
              ? dueToneFor(state.kind)
              : p.schedule.kind === 'asNeeded'
                ? ('muted' as const)
                : undefined,
            vialId,
            trace,
            level,
            canLog: vialId !== null,
            scheduled: true,
            to: { name: 'peptide', params: { key: p.key } },
            log: () => log.start('dose', { vialId: vialId ?? undefined }),
          }
        }),
    )

    const inSystemItems: PepCalcDueItem[] = shelf.levelGroups.flatMap((group) => {
      if (!group.pk || !anyDoseInEffect(group.doses, group.pk.params, now.value)) return []
      let peptideKey = group.peptideId
      if (!peptideKey) {
        const vial = shelf.vialById(group.key.replace(/^vial:/, ''))
        if (!vial) return []
        peptideKey = sameProductKey(vial)
      }
      if (coveredKeys.has(peptideKey)) return []
      coveredKeys.add(peptideKey)

      const activeVial = shelf.activeVials.find((v) => sameProductKey(v) === peptideKey)
      const last = lastDrawFor(peptideKey, shelf.vials, shelf.draws)
      let detail = 'No schedule'
      if (last) {
        const day = formatDay(toEpochMs(last.takenAt), now.value)
        const when = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
        detail = `Last: ${formatQuantity(last.dose)}, ${when}`
      }

      const labelUnit = unitLabel(group.unit)
      const { amount, percentOfPeak } = levelNow(group.doses, group.pk.params, now.value)
      const pastProj = projectLevels({
        params: group.pk.params,
        doseTimes: [],
        amount: null,
        history: group.doses,
        now: now.value,
      })

      return [
        {
          id: `system:${group.key}`,
          title: group.label,
          detail,
          dueAt: null,
          gapHours: 0,
          asNeeded: false,
          dueLabel: 'In your system',
          dueTone: 'brand' as const,
          vialId: activeVial?.id ?? null,
          trace: levelTrace(pastProj, now.value),
          level: {
            amountText: formatAmount(amount, labelUnit),
            percentOfPeak,
            stat: { label: 'Half-life', value: formatHours(group.pk.params.halfLifeHours) },
            userSupplied: group.pk.userSupplied,
          },
          canLog: activeVial !== undefined,
          scheduled: false,
          to: { name: 'peptide', params: { key: peptideKey } },
          log: () => {
            if (activeVial) log.start('dose', { vialId: activeVial.id })
          },
        },
      ]
    })

    return [...scheduledItems, ...inSystemItems]
  })

  return { items }
}
