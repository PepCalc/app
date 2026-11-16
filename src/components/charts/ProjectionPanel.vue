<script setup lang="ts">
import { computed } from 'vue'
import type { SourceRef } from '@/domain/catalog'
import type { DoseEvent, PkParameters } from '@/domain/pk'
import { formatAmount } from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { formatHours } from '@/services/time'
import MoreInfo from '@/components/common/MoreInfo.vue'
import SourceList from '@/components/common/SourceList.vue'
import ProjectionChart from './ProjectionChart.vue'

interface PkSource {
  name: string
  pk: (PkParameters & { notes: string; sources: SourceRef[] }) | null
  pkUnavailableReason?: string
}

/**
 * Projected levels inside a schedule form, updating as the schedule changes. The form holds no
 * dose, so the chart repeats the given one, or reads in percent without it.
 */
const props = defineProps<{
  /** Catalog entry reduced to `{ name, pk, pkUnavailableReason }`, or undefined outside it. */
  source: PkSource | undefined
  /** User-supplied parameters; take precedence over the catalog. */
  override: PkParameters | null
  intervalHours: number
  intervalLabel: string
  /** Repeated dose in `unitLabel`, or null before any is known. */
  amount: number | null
  /** Logged doses in `unitLabel`, oldest first. */
  history: DoseEvent[]
  unitLabel: string
}>()

const now = useNow()

const params = computed<PkParameters | null>(() => props.override ?? props.source?.pk ?? null)
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
        <template v-else>Percent of steady peak. Log a dose to see amounts.</template>
      </p>
    </div>
    <div class="d-flex flex-wrap ga-2 align-center">
      <span class="pc-badge pc-badge--brand pc-num"
        >half-life {{ formatHours(params.halfLifeHours) }}</span
      >
      <span class="pc-badge pc-badge--brand pc-num">peak {{ formatHours(params.tmaxHours) }}</span>
      <span v-if="userSupplied" class="pc-badge pc-badge--notice">
        <span class="pc-badge__dot" />Your own values
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
    <MoreInfo>
      <p class="text-body-small pc-muted">Estimate from the half-life and time to peak.</p>
      <SourceList
        v-if="!userSupplied && source?.pk"
        flat
        :sources="source.pk.sources"
        :note="source.pk.notes"
      />
    </MoreInfo>
  </section>
  <p v-else-if="source?.pkUnavailableReason" class="text-body-small pc-muted">
    {{ source.pkUnavailableReason }}
  </p>
</template>

<style scoped>
.projection-panel {
  padding: 16px;
  border-radius: var(--pc-radius-md);
  background-color: var(--pc-brand-softer);
}
</style>
