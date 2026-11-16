import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSettingsStore, type VialAgeMode } from '@/stores/settings'
import { inUseLimitFor, type AppliedInUseLimit } from '@/data'
import type { VialRow } from '@/db/database'
import { ageTier, limitsForWindow, type AgeLimits, type AgeTier } from '@/domain/vialAge'
import { daysBetween } from '@/services/time'

export interface VialAge {
  /** Whole days since the vial was mixed. */
  days: number
  tier: AgeTier
  limits: AgeLimits
  /** The cited window behind the limits; always present so the vial page can show its source. */
  window: AppliedInUseLimit
  /** True when the limits are the user's own thresholds from Settings rather than the window. */
  custom: boolean
}

/**
 * Age of a mixed vial against its use window, or null when the vial has no mixing date. Uses the
 * cited window by default, or the user's thresholds when Settings says so; `now` is epoch ms.
 */
export function vialAgeFor(
  vial: VialRow | undefined,
  now: number,
  settings: { vialAgeMode: VialAgeMode; customAgeLimits: AgeLimits },
): VialAge | null {
  if (!vial?.reconstitutedAt) return null
  const days = Math.max(0, daysBetween(vial.reconstitutedAt, now))
  const window = inUseLimitFor(vial.peptideId, vial.components)
  const custom = settings.vialAgeMode === 'custom'
  const limits = custom ? settings.customAgeLimits : limitsForWindow(window.limit.days)
  return { days, tier: ageTier(days, limits), limits, window, custom }
}

/**
 * Reactive age of a mixed vial against its use window, or null when it has no mixing date.
 */
export function useVialAge(
  vial: MaybeRefOrGetter<VialRow | undefined>,
  now: MaybeRefOrGetter<number>,
) {
  const settings = useSettingsStore()

  const age = computed<VialAge | null>(() => vialAgeFor(toValue(vial), toValue(now), settings))

  return { age }
}
