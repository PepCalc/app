<script setup lang="ts">
import { computed } from 'vue'
import type { VialRow } from '@/db/database'
import type { VialBalance } from '@/domain/inventory'
import { roundTo, unitLabel } from '@/domain/units'
import { useVialAge } from '@/composables/useVialAge'
import { formatDate } from '@/services/time'
import VialAgeBadge from './VialAgeBadge.vue'
import { mdiCalculatorVariantOutline, mdiChevronRight } from '@/plugins/icons'

const props = defineProps<{
  vial: VialRow
  balance: VialBalance
  /** The vial's name with its number when another vial of the same peptide exists. */
  title: string
  /** Epoch ms, so the age badge ticks without a timer per card. */
  now: number
}>()

const isArchived = computed(() => props.vial.status === 'archived')
const remainingPct = computed(() => Math.round((1 - props.balance.usedFraction) * 100))
const meterColor = computed(() =>
  remainingPct.value <= 10 ? 'error' : remainingPct.value <= 25 ? 'warning' : 'primary',
)
const { age } = useVialAge(
  () => props.vial,
  () => props.now,
)
</script>

<template>
  <v-card
    :to="{ name: 'vial', params: { id: vial.id } }"
    :variant="isArchived ? 'tonal' : undefined"
    :class="['vial-card', { 'vial-card--archived': isArchived }]"
  >
    <v-card-item :density="isArchived ? 'compact' : undefined">
      <template #append>
        <span v-if="isArchived" class="pc-badge mr-2">Archived</span>
        <v-icon :icon="mdiChevronRight" />
      </template>
      <v-card-title :class="['text-wrap', { 'vial-card__title--archived': isArchived }]">
        {{ title }}
      </v-card-title>
      <v-card-subtitle class="pc-num">
        {{ vial.amount }} {{ unitLabel(vial.unit) }} in {{ vial.diluentMl }} mL
        <template v-if="vial.reconstitutedAt">
          · mixed {{ formatDate(vial.reconstitutedAt) }}</template
        >
      </v-card-subtitle>
    </v-card-item>
    <template v-if="!isArchived">
      <v-card-text class="pc-stack pc-stack--tight">
        <div v-if="age">
          <VialAgeBadge :age="age" />
        </div>
        <div class="d-flex justify-space-between align-baseline pc-num">
          <span>
            <strong>{{ roundTo(balance.remainingAmount, 3) }} {{ unitLabel(vial.unit) }}</strong>
            <span class="pc-muted"> left · {{ roundTo(balance.remainingMl, 2) }} mL</span>
          </span>
          <span v-if="balance.dosesLeft !== null" class="pc-muted">
            ~{{ balance.dosesLeft }} doses
          </span>
        </div>
        <v-progress-linear
          :model-value="remainingPct"
          :color="meterColor"
          bg-color="surface-variant"
          bg-opacity="1"
          height="8"
          rounded
          :aria-label="`${remainingPct}% remaining`"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn
          :to="{ name: 'calculator', query: { vial: vial.id } }"
          :prepend-icon="mdiCalculatorVariantOutline"
          variant="text"
          @click.stop
        >
          Calculate a draw
        </v-btn>
      </v-card-actions>
    </template>
  </v-card>
</template>

<style scoped>
.vial-card--archived {
  opacity: 0.72;
}

.vial-card__title--archived {
  font-size: 0.9375rem;
  color: var(--pc-text-2);
}
</style>
