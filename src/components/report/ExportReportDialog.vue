<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { ReportPeriod } from '@/domain/report'
import { REPORT_SECTIONS, type ReportSection } from '@/services/report/reportData'
import { useReportExport } from '@/composables/useReportExport'
import { useNow } from '@/composables/useNow'
import { mdiFilePdfBox } from '@/plugins/icons'

/**
 * Choose a period and what to include, and export the report as a PDF. Sections with nothing
 * logged in the period are shown but cannot be ticked, so the reader sees why they are missing.
 */
const open = defineModel<boolean>({ required: true })
const period = ref<ReportPeriod>('90d')
const report = useReportExport()
const now = useNow()
const titleId = useId()
const periodId = useId()
const includeId = useId()

const PERIODS: { value: ReportPeriod; title: string }[] = [
  { value: '30d', title: '30 days' },
  { value: '90d', title: '90 days' },
  { value: 'all', title: 'All' },
]

const SECTIONS: Record<ReportSection, { title: string; detail: string }> = {
  combined: {
    title: 'Combined chart',
    detail: 'The other parts you include, on one time axis',
  },
  levels: { title: 'Estimated levels', detail: 'Each peptide’s totals, level chart and sources' },
  weight: { title: 'Weight and BMI', detail: 'Change over the period, with charts' },
  sugar: { title: 'Blood sugar', detail: 'HbA1c and glucose charts and readings' },
  vitals: { title: 'Blood pressure and heart rate', detail: 'Charts and readings' },
  symptoms: { title: 'Side effects', detail: 'How often, how strong, and when after a draw' },
  draws: { title: 'Draw log', detail: 'Every draw, with its notes' },
}

/** What the reader ticked; a section with nothing in the period is left out whatever it says. */
const chosen = ref(new Set<ReportSection>(REPORT_SECTIONS))
const available = computed(() => report.actions.available(period.value, now.value))
const included = computed(() =>
  REPORT_SECTIONS.filter((s) => chosen.value.has(s) && available.value.has(s)),
)
/** The combined chart draws the other parts, so on its own it has nothing to show. */
const canExport = computed(() => included.value.some((s) => s !== 'combined'))

function toggle(section: ReportSection, on: boolean | null) {
  const next = new Set(chosen.value)
  if (on) next.add(section)
  else next.delete(section)
  chosen.value = next
}

async function exportReport() {
  if (await report.actions.exportReport(period.value, included.value)) open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <v-card-title :id="titleId" class="text-wrap">Export report</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <div>
          <span :id="periodId" class="pc-label">Period</span>
          <v-btn-toggle v-model="period" mandatory role="group" :aria-labelledby="periodId">
            <v-btn v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.title }}</v-btn>
          </v-btn-toggle>
        </div>
        <div role="group" :aria-labelledby="includeId">
          <span :id="includeId" class="pc-label">Include</span>
          <v-checkbox
            v-for="s in REPORT_SECTIONS"
            :key="s"
            :model-value="available.has(s) && chosen.has(s)"
            :disabled="!available.has(s)"
            color="primary"
            density="compact"
            hide-details
            @update:model-value="toggle(s, $event)"
          >
            <template #label>
              <span class="section">
                <span>{{ SECTIONS[s].title }}</span>
                <span class="text-body-small pc-muted">{{
                  available.has(s) ? SECTIONS[s].detail : 'Nothing logged in this period'
                }}</span>
              </span>
            </template>
          </v-checkbox>
        </div>
        <p v-if="!canExport" class="text-body-medium pc-muted">
          Choose at least one part to include.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          variant="flat"
          color="primary"
          :prepend-icon="mdiFilePdfBox"
          :loading="report.state.busy"
          :disabled="!canExport"
          @click="exportReport"
        >
          Export PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  padding-block: 4px;
}
</style>
