<script setup lang="ts">
import { computed } from 'vue'
import type { CatalogPeptide } from '@/domain/catalog'
import type { DoseEvent, PkParameters } from '@/domain/pk'
import { formatAmount } from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { formatHours } from '@/services/time'
import SourceList from '@/components/common/SourceList.vue'
import ProjectionChart from './ProjectionChart.vue'

/**
 * Projected levels inside the protocol form, updating as the schedule changes. The form holds no
 * dose, so the chart repeats the given one, or reads in percent without it.
 */
const props = defineProps<{
  peptide: CatalogPeptide | undefined
  /** User-supplied parameters from a shelf vial; take precedence over the catalog. */
  override: PkParameters | null
  intervalHours: number
  intervalLabel: string
  /** The last draw, else the vial's usual dose; null when neither exists. */
  amount: number | null
  /** Logged doses of this peptide in `unitLabel`, oldest first. */
  history: DoseEvent[]
  unitLabel: string
}>()

const now = useNow()

const params = computed<PkParameters | null>(() => props.override ?? props.peptide?.pk ?? null)
const userSupplied = computed(() => props.override !== null)
</script>

<template>
  <section v-if="params" class="projection-panel pc-stack" aria-label="Projected levels">
    <div>
      <p class="pc-eyebrow">Projected levels</p>
      <p class="text-body-small pc-muted">
        <template v-if="amount !== null">
          At {{ formatAmount(amount, unitLabel) }} {{ intervalLabel }}.
        </template>
        <template v-else>Percent of steady peak. Log a draw to see amounts.</template>
      </p>
    </div>
    <div class="d-flex flex-wrap ga-2 align-center">
      <span class="pc-badge pc-badge--brand pc-num"
        >t½ {{ formatHours(params.halfLifeHours) }}</span
      >
      <span class="pc-badge pc-badge--brand pc-num">peak {{ formatHours(params.tmaxHours) }}</span>
      <span v-if="userSupplied" class="pc-badge pc-badge--notice">
        <span class="pc-badge__dot" />User-supplied values
      </span>
    </div>
    <ProjectionChart
      :params="params"
      :interval-hours="intervalHours"
      :amount="amount"
      :history="history"
      :unit-label="unitLabel"
      :now="now"
    />
    <p class="text-body-small pc-muted">Estimate from the half-life and time to peak.</p>
    <div v-if="!userSupplied && peptide?.pk" class="pc-stack pc-stack--tight">
      <p class="text-body-small pc-muted">{{ peptide.pk.notes }}</p>
      <SourceList :sources="peptide.pk.sources" />
    </div>
  </section>
  <p v-else class="text-body-small pc-muted">
    {{ peptide?.pkUnavailableReason ?? 'No data for this peptide. Add a half-life on the vial.' }}
  </p>
</template>

<style scoped>
.projection-panel {
  padding: 16px;
  border-radius: var(--pc-radius-md);
  background-color: var(--pc-brand-softer);
}
</style>
