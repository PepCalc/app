<script setup lang="ts">
import { computed, ref } from 'vue'
import { BMI_SOURCE } from '@/domain/body'
import {
  formatPercentChange,
  formatWeight,
  formatWeightChange,
  unitsSummary,
} from '@/domain/bodyUnits'
import { formatA1c, formatGlucose, GLUCOSE_CONTEXT_LABELS } from '@/domain/glucose'
import { summarizeSymptoms } from '@/domain/symptoms'
import { formatBloodPressure, formatHeartRate } from '@/domain/vitals'
import { roundTo } from '@/domain/units'
import { useJournalStore } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { useNow } from '@/composables/useNow'
import { useBodyMetrics } from '@/composables/useBodyMetrics'
import { formatDate, formatDateTime, toEpochMs } from '@/services/time'
import {
  mdiFilePdfBox,
  mdiHeartPulse,
  mdiScaleBathroom,
  mdiStethoscope,
  mdiWaterOutline,
} from '@/plugins/icons'
import SourceList from '@/components/common/SourceList.vue'
import TrendCard from '@/components/charts/TrendCard.vue'
import PhotosCard from '@/components/photos/PhotosCard.vue'
import SymptomSummaryCard from '@/components/journal/SymptomSummaryCard.vue'
import JournalEntries from '@/components/journal/JournalEntries.vue'
import LogWeightDialog from '@/components/journal/LogWeightDialog.vue'
import LogSymptomDialog from '@/components/journal/LogSymptomDialog.vue'
import LogGlucoseDialog from '@/components/journal/LogGlucoseDialog.vue'
import LogVitalsDialog from '@/components/journal/LogVitalsDialog.vue'
import ExportReportDialog from '@/components/report/ExportReportDialog.vue'

/**
 * The journal: body measurements, blood sugar, vitals, side effects and progress photos, beside the
 * shelf's draws. Logging sits at the top; trends, photos and the full list of entries below.
 */
const journal = useJournalStore()
const settings = useSettingsStore()
const shelf = useShelfStore()
const now = useNow()
const body = useBodyMetrics()

const weightDialog = ref(false)
const exporting = ref(false)
const symptomDialog = ref(false)
const glucoseDialog = ref(false)
const vitalsDialog = ref(false)

const latest = computed(() => journal.latestWeight)
const change = computed(() => journal.change)
/** A change needs two weigh-ins; with one the card shows only the weight. */
const hasChange = computed(() => journal.weights.length > 1 && change.value !== null)

const latestA1c = computed(() => journal.glucose.find((g) => g.kind === 'a1c'))
const latestGlucose = computed(() => journal.glucose.find((g) => g.kind === 'glucose'))
const latestDay = computed(() => journal.glucose.find((g) => g.kind === 'daily'))

const latestBp = computed(() => journal.vitals.find((v) => v.kind === 'bp'))
const latestHr = computed(() => journal.vitals.find((v) => v.kind === 'hr'))

/** The last week of side effects, most frequent first. */
const RECENT_DAYS = 7
const recentSymptoms = computed(() =>
  summarizeSymptoms(
    journal.symptoms.map((s) => ({ ...s, at: toEpochMs(s.occurredAt) })),
    shelf.draws.map((d) => toEpochMs(d.takenAt)),
    now.value - RECENT_DAYS * 86_400_000,
  ),
)

const hasTrend = computed(
  () => journal.weights.length > 0 || journal.glucose.length > 0 || journal.vitals.length > 0,
)
const hasAnything = computed(
  () => hasTrend.value || journal.symptoms.length > 0 || shelf.draws.length > 0,
)
</script>

<template>
  <div class="pc-page">
    <header class="mb-4 d-flex align-end flex-wrap ga-3">
      <div class="flex-grow-1">
        <p class="pc-eyebrow">Body and how you feel</p>
        <h1 class="pc-display text-headline-large">Journal</h1>
      </div>
      <v-btn
        v-if="hasAnything"
        variant="tonal"
        color="primary"
        :prepend-icon="mdiFilePdfBox"
        @click="exporting = true"
      >
        Export PDF
      </v-btn>
    </header>
    <ExportReportDialog v-model="exporting" />

    <div class="journal-grid">
      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Weight</p>
          <v-card-title>
            <span v-if="latest" class="pc-num" data-testid="journal-weight">{{
              formatWeight(latest.kg, settings.weightUnit)
            }}</span>
            <span v-else>No weigh-ins yet</span>
          </v-card-title>
          <v-card-subtitle v-if="latest">{{ formatDateTime(latest.measuredAt) }}</v-card-subtitle>
        </v-card-item>
        <v-card-text class="pc-stack">
          <dl v-if="latest && (hasChange || body.currentBmi.value !== null)" class="stats">
            <div v-if="hasChange && change">
              <dt class="pc-faint">Since {{ formatDate(change.first.at) }}</dt>
              <dd class="pc-num">
                {{ formatWeightChange(change.changeKg, settings.weightUnit) }}
                <span class="pc-muted">({{ formatPercentChange(change.changePercent) }})</span>
              </dd>
            </div>
            <div v-if="body.currentBmi.value !== null">
              <dt class="pc-faint">BMI</dt>
              <dd class="pc-num" data-testid="journal-bmi">
                {{ roundTo(body.currentBmi.value, 1) }}
                <span v-if="body.band.value" class="pc-muted">· {{ body.band.value.label }}</span>
              </dd>
            </div>
          </dl>
          <SourceList v-if="body.currentBmi.value !== null" :sources="[BMI_SOURCE]" />
          <p v-if="latest && !body.heightCm.value" class="text-body-small pc-muted">
            Add your height in Settings to see your BMI.
          </p>
          <p v-if="!latest" class="text-body-small pc-muted d-flex align-center flex-wrap ga-1">
            <span>Units: {{ unitsSummary(settings.weightUnit, settings.heightUnit) }}.</span>
            <v-btn variant="text" :to="{ name: 'settings', hash: '#units' }">Change</v-btn>
          </p>
          <div class="pc-actions">
            <v-btn variant="tonal" :prepend-icon="mdiScaleBathroom" @click="weightDialog = true">
              Log weight
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Blood sugar</p>
          <v-card-title>
            <span v-if="latestA1c" class="pc-num"
              >HbA1c {{ formatA1c(latestA1c.value, settings.a1cUnit) }}</span
            >
            <span v-else-if="latestGlucose" class="pc-num">{{
              formatGlucose(latestGlucose.value, settings.glucoseUnit)
            }}</span>
            <span v-else-if="latestDay" class="pc-num"
              >Average {{ formatGlucose(latestDay.value, settings.glucoseUnit) }}</span
            >
            <span v-else>No readings yet</span>
          </v-card-title>
          <v-card-subtitle v-if="latestA1c">{{
            formatDateTime(latestA1c.measuredAt)
          }}</v-card-subtitle>
        </v-card-item>
        <v-card-text class="pc-stack">
          <p v-if="latestA1c && latestGlucose" class="pc-muted">
            Latest glucose
            <span class="pc-num">{{
              formatGlucose(latestGlucose.value, settings.glucoseUnit)
            }}</span>
            ({{ GLUCOSE_CONTEXT_LABELS[latestGlucose.context].toLowerCase() }})
          </p>
          <p v-else-if="latestGlucose" class="pc-muted">
            {{ GLUCOSE_CONTEXT_LABELS[latestGlucose.context] }} ·
            {{ formatDateTime(latestGlucose.measuredAt) }}
          </p>
          <p v-else-if="latestDay" class="pc-muted">
            Glucose monitor, {{ formatDate(latestDay.measuredAt) }}
          </p>
          <p v-else-if="!latestA1c" class="pc-muted">
            Log an HbA1c result or a glucose reading to follow them over time.
          </p>
          <div class="pc-actions">
            <v-btn variant="tonal" :prepend-icon="mdiWaterOutline" @click="glucoseDialog = true">
              Log blood sugar
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Vitals</p>
          <v-card-title>
            <span v-if="latestBp?.kind === 'bp'" class="pc-num">{{
              formatBloodPressure(latestBp.systolic, latestBp.diastolic)
            }}</span>
            <span v-else-if="latestHr?.kind === 'hr'" class="pc-num">{{
              formatHeartRate(latestHr.bpm)
            }}</span>
            <span v-else>No readings yet</span>
          </v-card-title>
          <v-card-subtitle v-if="latestBp ?? latestHr">{{
            formatDateTime((latestBp ?? latestHr)!.measuredAt)
          }}</v-card-subtitle>
        </v-card-item>
        <v-card-text class="pc-stack">
          <dl v-if="latestBp && latestHr?.kind === 'hr'" class="stats">
            <div>
              <dt class="pc-faint">Resting heart rate</dt>
              <dd class="pc-num">{{ formatHeartRate(latestHr.bpm) }}</dd>
            </div>
          </dl>
          <p v-else-if="!latestBp && !latestHr" class="pc-muted">
            Log blood pressure and resting heart rate.
          </p>
          <div class="pc-actions">
            <v-btn variant="tonal" :prepend-icon="mdiHeartPulse" @click="vitalsDialog = true">
              Log vitals
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Side effects</p>
          <v-card-title>Last {{ RECENT_DAYS }} days</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <ul v-if="recentSymptoms.length" class="symptom-list" aria-label="Side effects this week">
            <li v-for="s in recentSymptoms" :key="s.key" class="pc-badge pc-badge--info">
              {{ s.name }} <span class="pc-num">× {{ s.count }}</span>
            </li>
          </ul>
          <p v-else class="pc-muted">Nothing logged this week.</p>
          <div class="pc-actions">
            <v-btn variant="tonal" :prepend-icon="mdiStethoscope" @click="symptomDialog = true">
              Log side effect
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <section v-if="hasTrend" class="mt-6" aria-labelledby="trends-heading">
      <h2 id="trends-heading" class="pc-display text-title-large mb-4">Trends</h2>
      <div class="journal-grid journal-grid--wide">
        <TrendCard />
      </div>
    </section>

    <section id="photos" class="mt-6" aria-labelledby="photos-heading">
      <h2 id="photos-heading" class="pc-display text-title-large mb-4">Photos</h2>
      <div class="journal-grid journal-grid--wide">
        <PhotosCard />
      </div>
    </section>

    <section v-if="journal.symptoms.length" class="mt-6" aria-labelledby="effects-heading">
      <h2 id="effects-heading" class="pc-display text-title-large mb-4">Side effects</h2>
      <div class="journal-grid journal-grid--wide">
        <SymptomSummaryCard :now="now" />
      </div>
    </section>

    <section class="mt-6" aria-labelledby="entries-heading">
      <h2 id="entries-heading" class="pc-display text-title-large mb-4">Entries</h2>
      <JournalEntries />
    </section>

    <LogWeightDialog v-model="weightDialog" :weight="null" />
    <LogSymptomDialog v-model="symptomDialog" :symptom="null" />
    <LogGlucoseDialog v-model="glucoseDialog" :reading="null" />
    <LogVitalsDialog v-model="vitalsDialog" :reading="null" />
  </div>
</template>

<style scoped>
.journal-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  align-items: start;
}

.journal-grid--wide {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px 24px;
  margin: 0;
}

.stats dt {
  font-size: 0.75rem;
  font-weight: 600;
}

.stats dd {
  margin: 0;
  font-weight: 600;
}

.symptom-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
