import { computed, watch } from 'vue'
import { findPeptide } from '@/data'
import { unitLabel } from '@/domain/units'
import type { PanelPeptide } from '@/components/charts/bodyChart'
import { useLevelPickStore } from '@/stores/levelPick'
import { useShelfStore } from '@/stores/shelf'

/**
 * The peptides for the dose rows and level strip under a body measure: every peptide with a
 * logged draw can be picked, newest first, sharing the pick and colours with the Protocols
 * overlay. A peptide without human PK data gets a row but no level line.
 */
export function usePeptidePanels() {
  const shelf = useShelfStore()
  const pick = useLevelPickStore()

  const groups = computed(() => shelf.levelGroups.filter((g) => g.doses.length))
  const chosen = computed({
    get: () => pick.picked(groups.value.map((g) => g.key)),
    set: (keys: string[]) => pick.choose(keys),
  })
  watch(chosen, (keys) => pick.assign(keys), { immediate: true })

  const peptides = computed<PanelPeptide[]>(() =>
    groups.value
      .filter((g) => chosen.value.includes(g.key))
      .map((g) => {
        const unit = unitLabel(g.unit)
        // A curve from the user's own half-life says so wherever its name appears.
        const label = g.pk?.userSupplied ? `${g.label} (your values)` : g.label
        return {
          key: g.key,
          label: g.label,
          unitLabel: unit,
          doses: g.doses,
          slot: pick.slots.get(g.key) ?? 0,
          userSupplied: g.pk?.userSupplied ?? false,
          strip: g.pk
            ? { key: g.key, label, params: g.pk.params, doses: g.doses, unitLabel: unit }
            : null,
        }
      }),
  )

  /** Where each level line's half-life and peak come from, shown under the chart. */
  const sources = computed(() =>
    groups.value
      .filter((g) => chosen.value.includes(g.key) && g.pk)
      .map((g) => ({
        key: g.key,
        label: g.label,
        userSupplied: g.pk!.userSupplied,
        pk: g.pk!.userSupplied ? null : (findPeptide(g.peptideId)?.pk ?? null),
      })),
  )

  /** Picked peptides with no curve, named under the chart. */
  const withoutCurve = computed(() => peptides.value.filter((p) => !p.strip).map((p) => p.label))

  return { groups, chosen, peptides, sources, withoutCurve, slots: computed(() => pick.slots) }
}
