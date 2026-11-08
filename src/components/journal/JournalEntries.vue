<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GlucoseRow, SymptomRow, VitalRow } from '@/db/database'
import { formatWeight } from '@/domain/bodyUnits'
import {
  formatA1c,
  formatGlucose,
  formatGlucoseRange,
  GLUCOSE_CONTEXT_LABELS,
} from '@/domain/glucose'
import { SEVERITY_LABELS, symptomName } from '@/domain/symptoms'
import { formatBloodPressure, formatHeartRate } from '@/domain/vitals'
import { sortByTime, type SortDirection } from '@/domain/listing'
import { useJournalStore, type WeightEntry } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { usePaging } from '@/composables/usePaging'
import { formatDate, formatDateTime, toEpochMs } from '@/services/time'
import { mdiHeartPulse, mdiScaleBathroom, mdiStethoscope, mdiWaterOutline } from '@/plugins/icons'
import ListPager from '@/components/common/ListPager.vue'
import SortToggle from '@/components/common/SortToggle.vue'
import LogWeightDialog from './LogWeightDialog.vue'
import LogSymptomDialog from './LogSymptomDialog.vue'
import LogGlucoseDialog from './LogGlucoseDialog.vue'
import LogVitalsDialog from './LogVitalsDialog.vue'

/** Every journal entry by kind, paged, newest or oldest first; tapping one opens it to edit. */
const journal = useJournalStore()
const settings = useSettingsStore()

const tab = ref<'weights' | 'glucose' | 'vitals' | 'symptoms'>('weights')
const direction = ref<SortDirection>('desc')

const weights = computed(() =>
  sortByTime(journal.weights, (w) => toEpochMs(w.measuredAt), direction.value),
)
const symptoms = computed(() =>
  sortByTime(journal.symptoms, (s) => toEpochMs(s.occurredAt), direction.value),
)
const readings = computed(() =>
  sortByTime(journal.glucose, (g) => toEpochMs(g.measuredAt), direction.value),
)
const vitals = computed(() =>
  sortByTime(journal.vitals, (v) => toEpochMs(v.measuredAt), direction.value),
)

const weightPages = usePaging(weights)
const symptomPages = usePaging(symptoms)
const readingPages = usePaging(readings)
const vitalPages = usePaging(vitals)
watch([direction, tab], () => {
  weightPages.reset()
  symptomPages.reset()
  readingPages.reset()
  vitalPages.reset()
})

const weightDialog = ref(false)
const editingWeight = ref<WeightEntry | null>(null)
const symptomDialog = ref(false)
const editingSymptom = ref<SymptomRow | null>(null)
const glucoseDialog = ref(false)
const editingReading = ref<GlucoseRow | null>(null)

function editWeight(w: WeightEntry) {
  editingWeight.value = w
  weightDialog.value = true
}

function editSymptom(row: SymptomRow) {
  editingSymptom.value = row
  symptomDialog.value = true
}

function editReading(row: GlucoseRow) {
  editingReading.value = row
  glucoseDialog.value = true
}

const vitalsDialog = ref(false)
const editingVital = ref<VitalRow | null>(null)

function editVital(row: VitalRow) {
  editingVital.value = row
  vitalsDialog.value = true
}

function vitalTitle(v: VitalRow): string {
  return v.kind === 'bp' ? formatBloodPressure(v.systolic, v.diastolic) : formatHeartRate(v.bpm)
}

function vitalSubtitle(v: VitalRow): string {
  const when = formatDateTime(v.measuredAt)
  return `${v.kind === 'bp' ? 'Blood pressure' : 'Resting heart rate'} · ${when}`
}

function readingTitle(g: GlucoseRow): string {
  if (g.kind === 'a1c') return `HbA1c ${formatA1c(g.value, settings.a1cUnit)}`
  if (g.kind === 'daily') return `Average ${formatGlucose(g.value, settings.glucoseUnit)}`
  return formatGlucose(g.value, settings.glucoseUnit)
}

function readingSubtitle(g: GlucoseRow): string {
  if (g.kind === 'daily')
    return `Glucose monitor · ${formatGlucoseRange(g.min, g.max, settings.glucoseUnit)} · ${formatDate(g.measuredAt)}`
  const when = formatDateTime(g.measuredAt)
  return g.kind === 'glucose' ? `${GLUCOSE_CONTEXT_LABELS[g.context]} · ${when}` : when
}
</script>

<template>
  <v-card>
    <v-tabs v-model="tab" color="primary" show-arrows>
      <v-tab value="weights">Weights ({{ journal.weights.length }})</v-tab>
      <v-tab value="glucose">Blood sugar ({{ journal.glucose.length }})</v-tab>
      <v-tab value="vitals">Vitals ({{ journal.vitals.length }})</v-tab>
      <v-tab value="symptoms">Side effects ({{ journal.symptoms.length }})</v-tab>
    </v-tabs>
    <v-card-text class="pc-stack">
      <SortToggle v-model="direction" label="Order" />

      <template v-if="tab === 'symptoms'">
        <p v-if="!journal.symptoms.length" class="pc-muted">No side effects logged.</p>
        <v-list v-else class="bg-transparent" density="comfortable">
          <v-list-item
            v-for="row in symptomPages.current.value.items"
            :key="row.id"
            :prepend-icon="mdiStethoscope"
            :subtitle="`${SEVERITY_LABELS[row.severity]} · ${formatDateTime(row.occurredAt)}`"
            @click="editSymptom(row)"
          >
            <v-list-item-title>{{ symptomName(row) }}</v-list-item-title>
            <p v-if="row.notes" class="text-body-small pc-muted note">{{ row.notes }}</p>
          </v-list-item>
        </v-list>
        <ListPager
          v-model="symptomPages.state.page"
          :current="symptomPages.current.value"
          noun="entries"
        />
      </template>

      <template v-else-if="tab === 'glucose'">
        <p v-if="!journal.glucose.length" class="pc-muted">No blood sugar readings yet.</p>
        <v-list v-else class="bg-transparent" density="comfortable">
          <v-list-item
            v-for="row in readingPages.current.value.items"
            :key="row.id"
            :prepend-icon="mdiWaterOutline"
            :subtitle="readingSubtitle(row)"
            @click="editReading(row)"
          >
            <v-list-item-title class="pc-num">{{ readingTitle(row) }}</v-list-item-title>
            <p v-if="row.notes" class="text-body-small pc-muted note">{{ row.notes }}</p>
          </v-list-item>
        </v-list>
        <ListPager
          v-model="readingPages.state.page"
          :current="readingPages.current.value"
          noun="readings"
        />
      </template>

      <template v-else-if="tab === 'vitals'">
        <p v-if="!journal.vitals.length" class="pc-muted">No vitals logged yet.</p>
        <v-list v-else class="bg-transparent" density="comfortable">
          <v-list-item
            v-for="row in vitalPages.current.value.items"
            :key="row.id"
            :prepend-icon="mdiHeartPulse"
            :subtitle="vitalSubtitle(row)"
            @click="editVital(row)"
          >
            <v-list-item-title class="pc-num">{{ vitalTitle(row) }}</v-list-item-title>
            <p v-if="row.notes" class="text-body-small pc-muted note">{{ row.notes }}</p>
          </v-list-item>
        </v-list>
        <ListPager
          v-model="vitalPages.state.page"
          :current="vitalPages.current.value"
          noun="readings"
        />
      </template>

      <template v-else>
        <p v-if="!journal.weights.length" class="pc-muted">No weigh-ins yet.</p>
        <v-list v-else class="bg-transparent" density="comfortable">
          <v-list-item
            v-for="w in weightPages.current.value.items"
            :key="w.id"
            :prepend-icon="mdiScaleBathroom"
            :subtitle="formatDateTime(w.measuredAt)"
            @click="editWeight(w)"
          >
            <v-list-item-title class="pc-num">
              {{ formatWeight(w.kg, settings.weightUnit) }}
            </v-list-item-title>
            <p v-if="w.notes" class="text-body-small pc-muted note">{{ w.notes }}</p>
          </v-list-item>
        </v-list>
        <ListPager
          v-model="weightPages.state.page"
          :current="weightPages.current.value"
          noun="weigh-ins"
        />
      </template>
    </v-card-text>
  </v-card>

  <LogWeightDialog v-model="weightDialog" :weight="editingWeight" />
  <LogSymptomDialog v-model="symptomDialog" :symptom="editingSymptom" />
  <LogGlucoseDialog v-model="glucoseDialog" :reading="editingReading" />
  <LogVitalsDialog v-model="vitalsDialog" :reading="editingVital" />
</template>

<style scoped>
.note {
  white-space: pre-wrap;
}
</style>
