<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatPercentChange, formatWeeklyChange, formatWeightChange } from '@/domain/bodyUnits'
import { changeStats } from '@/domain/progressStats'
import { useEntries } from '@/composables/useEntries'
import { useNow } from '@/composables/useNow'
import { formatDate, toEpochMs } from '@/services/time'
import { useJournalStore } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { mdiChevronRight, mdiFilePdfBox } from '@/plugins/icons'
import StatTile from '@/components/common/StatTile.vue'
import TrendCard from '@/components/charts/TrendCard.vue'
import PhotosCard from '@/components/photos/PhotosCard.vue'
import SymptomSummaryCard from '@/components/journal/SymptomSummaryCard.vue'
import ExportReportDialog from '@/components/report/ExportReportDialog.vue'

const journal = useJournalStore()
const settings = useSettingsStore()
const shelf = useShelfStore()
const now = useNow()
const { entries } = useEntries()

const reportOpen = ref(false)

const change = computed(() => journal.change)
const stats = computed(() =>
  change.value ? changeStats(change.value.first, change.value.latest) : null,
)

const hasAnything = computed(
  () =>
    journal.weights.length > 0 ||
    journal.glucose.length > 0 ||
    journal.vitals.length > 0 ||
    journal.symptoms.length > 0 ||
    shelf.draws.length > 0,
)

const doseTimes = computed(() => shelf.draws.map((d) => toEpochMs(d.takenAt)))
</script>

<template>
  <div class="pc-page">
    <header class="page-header mb-4">
      <div>
        <p class="pc-eyebrow">Over time</p>
        <h1 class="pc-display text-headline-large">Progress</h1>
      </div>
      <v-btn
        v-if="hasAnything"
        variant="tonal"
        :prepend-icon="mdiFilePdfBox"
        @click="reportOpen = true"
      >
        Export PDF
      </v-btn>
    </header>

    <v-alert v-if="!journal.weights.length" type="info" variant="tonal" class="mb-4">
      Log a weight to start your progress chart.
    </v-alert>

    <section v-if="stats" class="pc-stack pc-stack--tight mb-4" aria-label="Summary">
      <div class="stat-grid">
        <StatTile
          label="Total change"
          :value="formatWeightChange(stats.changeKg, settings.weightUnit)"
        />
        <StatTile label="Percent" :value="formatPercentChange(stats.changePercent)" />
        <StatTile
          label="Weekly average"
          :value="
            stats.weeklyKg !== null ? formatWeeklyChange(stats.weeklyKg, settings.weightUnit) : '–'
          "
          :note="stats.weeklyKg === null ? 'After two weeks' : undefined"
        />
      </div>
      <p class="text-body-small pc-muted">
        Started {{ formatDate(stats.startAt) }}. Since your first weigh-in.
      </p>
    </section>

    <div class="progress-grid">
      <TrendCard />
    </div>

    <section id="photos" class="mt-6">
      <h2 class="pc-display text-title-large mb-4">Photos</h2>
      <div class="progress-grid">
        <PhotosCard />
      </div>
    </section>

    <section v-if="journal.symptoms.length" id="side-effects" class="mt-6">
      <h2 class="pc-display text-title-large mb-4">Side effects</h2>
      <div class="progress-grid">
        <SymptomSummaryCard :now="now" :dose-times="doseTimes" />
      </div>
    </section>

    <v-card class="mt-6" :to="{ name: 'entries' }" link>
      <v-card-item>
        <template #title>All entries</template>
        <template #subtitle>
          {{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}
        </template>
        <template #append>
          <v-icon :icon="mdiChevronRight" />
        </template>
      </v-card-item>
    </v-card>

    <ExportReportDialog v-model="reportOpen" />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.stat-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.progress-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  align-items: start;
}
</style>
