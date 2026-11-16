import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { BandDose } from '@/domain/doseBands'
import { unitLabel } from '@/domain/units'
import { useShelfStore } from '@/stores/shelf'

/**
 * Doses prepared for the trend chart's colour bands and callout pills. PepCalc marks one
 * peptide at a time because several peptides taken daily cannot share one line.
 */
export function useDoseBands(): {
  /** Peptides with at least one logged draw, newest first. */
  candidates: ComputedRef<{ key: string; label: string }[]>
  /** The peptide marked on the line, or null when none has a logged draw. */
  marked: Ref<string | null>
  /** True when the user can pick between more than one peptide. */
  pick: ComputedRef<boolean>
  /** The doses to pass to `doseBands`. */
  doses: ComputedRef<BandDose[]>
} {
  const shelf = useShelfStore()

  const groups = computed(() => shelf.levelGroups.filter((g) => g.doses.length > 0))
  const candidates = computed(() => groups.value.map((g) => ({ key: g.key, label: g.label })))
  const pick = computed(() => candidates.value.length > 1)
  const marked = ref<string | null>(null)

  watch(
    candidates,
    (list) => {
      if (!list.length) {
        marked.value = null
        return
      }
      if (!marked.value || !list.some((c) => c.key === marked.value)) {
        marked.value = list[0]!.key
      }
    },
    { immediate: true },
  )

  const doses = computed<BandDose[]>(() => {
    const group = groups.value.find((g) => g.key === marked.value)
    if (!group) return []
    const unit = unitLabel(group.unit)
    return group.doses.map((d) => ({
      key: group.key,
      label: group.label,
      at: d.at,
      amount: d.amount,
      unitLabel: unit,
    }))
  })

  return { candidates, marked, pick, doses }
}
