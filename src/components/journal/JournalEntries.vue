<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GlucoseRow, SymptomRow, VitalRow } from '@/db/database'
import { glucoseEntry, symptomEntry, vitalEntry, weightEntry } from '@/domain/entryText'
import { sortByTime, type SortDirection } from '@/domain/listing'
import { useJournalStore } from '@/stores/journal'
import { useLogStore } from '@/stores/log'
import { useSettingsStore } from '@/stores/settings'
import { usePaging } from '@/composables/usePaging'
import { formatDate, formatDateTime, toEpochMs } from '@/services/time'
import { mdiHeartPulse, mdiScaleBathroom, mdiStethoscope, mdiWaterOutline } from '@/plugins/icons'
import ListPager from '@/components/common/ListPager.vue'
import SortToggle from '@/components/common/SortToggle.vue'

/** Every journal entry by kind, paged, newest or oldest first; tapping one opens it to edit. */
const journal = useJournalStore()
const log = useLogStore()
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

function vitalSubtitle(v: VitalRow): string {
  const entry = vitalEntry(v, toEpochMs(v.measuredAt))
  return `${entry.detail} · ${formatDateTime(v.measuredAt)}`
}

function readingSubtitle(g: GlucoseRow): string {
  const entry = glucoseEntry(
    g,
    { glucose: settings.glucoseUnit, a1c: settings.a1cUnit },
    toEpochMs(g.measuredAt),
  )
  const when = g.kind === 'daily' ? formatDate(g.measuredAt) : formatDateTime(g.measuredAt)
  return entry.detail ? `${entry.detail} · ${when}` : when
}

function symptomSubtitle(s: SymptomRow): string {
  const entry = symptomEntry(s, toEpochMs(s.occurredAt))
  return `${entry.detail} · ${formatDateTime(s.occurredAt)}`
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
            :subtitle="symptomSubtitle(row)"
            @click="log.edit({ kind: 'symptom', id: row.id })"
          >
            <v-list-item-title>{{
              symptomEntry(row, toEpochMs(row.occurredAt)).title
            }}</v-list-item-title>
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
            @click="log.edit({ kind: 'glucose', id: row.id })"
          >
            <v-list-item-title class="pc-num">{{
              glucoseEntry(
                row,
                { glucose: settings.glucoseUnit, a1c: settings.a1cUnit },
                toEpochMs(row.measuredAt),
              ).title
            }}</v-list-item-title>
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
            @click="log.edit({ kind: 'vital', id: row.id })"
          >
            <v-list-item-title class="pc-num">{{
              vitalEntry(row, toEpochMs(row.measuredAt)).title
            }}</v-list-item-title>
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
            @click="log.edit({ kind: 'weight', id: w.id })"
          >
            <v-list-item-title class="pc-num">
              {{ weightEntry(w, settings.weightUnit, toEpochMs(w.measuredAt)).title }}
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
</template>

<style scoped>
.note {
  white-space: pre-wrap;
}
</style>
