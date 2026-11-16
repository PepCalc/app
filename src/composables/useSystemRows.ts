import { computed, type ComputedRef, type Ref } from 'vue'
import type { SystemRow } from '@/components/today/SystemList.vue'
import { levelsModel } from '@/domain/levels'
import { anyDoseInEffect, levelNow, lookbackHoursFor } from '@/domain/pk'
import { curveTrace } from '@/domain/projection'
import { formatAmount, unitLabel } from '@/domain/units'
import { sameProductKey } from '@/domain/vials'
import { useShelfStore } from '@/stores/shelf'

/** Estimated amount in the body now for each peptide with a curve and a dose still in effect. */
export function useSystemRows(now: Ref<number>): {
  rows: ComputedRef<SystemRow[]>
} {
  const shelf = useShelfStore()

  const rows = computed<SystemRow[]>(() =>
    shelf.levelGroups.flatMap((group) => {
      if (!group.pk || !anyDoseInEffect(group.doses, group.pk.params, now.value)) return []
      let peptideKey = group.peptideId
      if (!peptideKey) {
        const vial = shelf.vialById(group.key.replace(/^vial:/, ''))
        if (!vial) return []
        peptideKey = sameProductKey(vial)
      }

      const labelUnit = unitLabel(group.unit)
      const { amount, percentOfPeak } = levelNow(group.doses, group.pk.params, now.value)
      const model = levelsModel({
        params: group.pk.params,
        doses: group.doses,
        preview: null,
        unitLabel: labelUnit,
        now: now.value,
        lookbackHours: lookbackHoursFor(group.pk.params),
      })
      return [
        {
          key: group.key,
          label: group.label,
          amountText: formatAmount(amount, labelUnit),
          percentOfPeak,
          trace: curveTrace(model),
          to: { name: 'peptide', params: { key: peptideKey } },
        },
      ]
    }),
  )

  return { rows }
}
