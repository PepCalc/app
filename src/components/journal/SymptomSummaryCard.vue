<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  SEVERITIES,
  SEVERITY_LABELS,
  SYMPTOM_SOURCES,
  summarizeSymptoms,
  type SymptomSummary,
} from '@/domain/symptoms'
import { roundTo } from '@/domain/units'
import { useJournalStore } from '@/stores/journal'
import { useShelfStore } from '@/stores/shelf'
import { formatDate, toEpochMs } from '@/services/time'
import SourceList from '@/components/common/SourceList.vue'

/**
 * Side effects over a chosen period: how often each came, how strong, when last, and how many
 * days after a draw (of any peptide) it usually arrived.
 */
const props = defineProps<{ now: number }>()

const journal = useJournalStore()
const shelf = useShelfStore()
const periodLabelId = useId()

const PERIODS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'All' },
] as const
const period = ref<number>(30)

const since = computed(() => (period.value ? props.now - period.value * 86_400_000 : -Infinity))
const summary = computed(() =>
  summarizeSymptoms(
    journal.symptoms.map((s) => ({ ...s, at: toEpochMs(s.occurredAt) })),
    shelf.draws.map((d) => toEpochMs(d.takenAt)),
    since.value,
  ),
)

function severityText(s: SymptomSummary): string {
  return SEVERITIES.filter((l) => s.bySeverity[l])
    .map((l) => `${s.bySeverity[l]} ${SEVERITY_LABELS[l].toLowerCase()}`)
    .join(', ')
}

function timingText(s: SymptomSummary): string {
  if (s.medianDaysAfterDose === null) return 'Before any draw'
  const days = roundTo(s.medianDaysAfterDose, 1)
  return days < 1 ? 'Same day as a draw' : `About ${days} day${days === 1 ? '' : 's'} after a draw`
}
</script>

<template>
  <v-card>
    <v-card-item>
      <p class="pc-eyebrow">Side effects</p>
      <v-card-title>How you’ve felt</v-card-title>
    </v-card-item>
    <v-card-text class="pc-stack">
      <div>
        <p :id="periodLabelId" class="pc-label">Period</p>
        <v-btn-toggle
          v-model="period"
          role="group"
          mandatory
          density="comfortable"
          :aria-labelledby="periodLabelId"
        >
          <v-btn v-for="p in PERIODS" :key="p.days" :value="p.days">{{ p.label }}</v-btn>
        </v-btn-toggle>
      </div>
      <v-table v-if="summary.length" density="comfortable" class="summary-table">
        <thead>
          <tr>
            <th scope="col">Side effect</th>
            <th scope="col" class="text-end">Times</th>
            <th scope="col">Strength and timing</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in summary" :key="s.key">
            <th scope="row" class="font-weight-medium">
              {{ s.name }}
              <span class="d-block text-body-small pc-faint">Last {{ formatDate(s.lastAt) }}</span>
            </th>
            <td class="text-end pc-num">{{ s.count }}</td>
            <td class="text-body-small">
              {{ severityText(s) }}
              <span class="d-block pc-muted">{{ timingText(s) }}</span>
            </td>
          </tr>
        </tbody>
      </v-table>
      <p v-else class="pc-muted">Nothing logged in this period.</p>
      <SourceList
        :sources="SYMPTOM_SOURCES"
        note="From the approved peptides’ label trials. Timing is from the last draw of any peptide."
      />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.summary-table {
  background: transparent;
}
</style>
