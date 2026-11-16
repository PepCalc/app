import { computed } from 'vue'
import { roundTo } from '@/domain/units'
import { useJournalStore } from '@/stores/journal'

export interface WeightTrendSummary {
  startAt: number
  startKg: number
  latestKg: number
  changeKg: number
  changePercent: number
  weeks: number | null
}

const WEEK_MS = 7 * 86_400_000

/**
 * Per-app weight goal and change summary read by the shared TrendCard and ShareTrendDialog so
 * both components stay identical across apps.
 */
export function useWeightSummary() {
  const journal = useJournalStore()

  const goalKg = computed<number | null>(() => null)

  const weightTrend = computed<WeightTrendSummary | null>(() => {
    const change = journal.change
    if (!change) return null
    const weeks = roundTo((change.latest.at - change.first.at) / WEEK_MS, 0)
    return {
      startAt: change.first.at,
      startKg: change.first.kg,
      latestKg: change.latest.kg,
      changeKg: change.changeKg,
      changePercent: change.changePercent,
      weeks: weeks > 0 ? weeks : null,
    }
  })

  return { goalKg, weightTrend }
}
