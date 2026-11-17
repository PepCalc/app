<script setup lang="ts">
import { computed, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { formatWeight, formatWeightChange, unitsSummary } from '@/domain/bodyUnits'
import { formatA1c, formatGlucose, GLUCOSE_CONTEXT_LABELS } from '@/domain/glucose'
import { dueState, remainingFraction } from '@/domain/schedule'
import { summarizeSymptoms } from '@/domain/symptoms'
import { roundTo } from '@/domain/units'
import { formatBloodPressure, formatHeartRate } from '@/domain/vitals'
import { useBodyMetrics } from '@/composables/useBodyMetrics'
import { useDueItems } from '@/composables/useDueItems'
import { useEntries } from '@/composables/useEntries'
import { useNow } from '@/composables/useNow'
import { formatDate, formatTodayDate, toEpochMs } from '@/services/time'
import { useJournalStore } from '@/stores/journal'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import StatTile from '@/components/common/StatTile.vue'
import EntriesTimeline from '@/components/journal/EntriesTimeline.vue'
import DoseCountdown from '@/components/protocols/DoseCountdown.vue'
import DueCard from '@/components/today/DueCard.vue'
import { mdiCalculatorVariantOutline, mdiChevronRight } from '@/plugins/icons'

interface TileItem {
  key: string
  label: string
  value: string
  note?: string
  to: RouteLocationRaw
}

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const journal = useJournalStore()
const log = useLogStore()
const settings = useSettingsStore()
const now = useNow()
const body = useBodyMetrics()
const { items: dueItems } = useDueItems(now)
const { entries } = useEntries()

/*
 * A tapped dose reminder arrives as `?log=<protocol id>`. It waits for the stores to load,
 * opens Log a draw for that protocol's active vial if it still exists, and clears the query
 * so a reload or Back does not open the dialog again.
 */
const route = useRoute()
const router = useRouter()
watch(
  () => [route.query.log, protocols.loaded, shelf.loaded] as const,
  ([id]) => {
    if (typeof id !== 'string' || !protocols.loaded || !shelf.loaded) return
    const p = protocols.protocols.find((row) => row.id === id)
    const vial = p ? protocols.drawVialOf(p) : undefined
    if (vial) {
      log.start('dose', { vialId: vial.id })
    }
    void router.replace({ query: {} })
  },
  { immediate: true },
)

const isEmpty = computed(() => shelf.loaded && !shelf.vials.length)

const RECENT_DAYS = 7
const DAY_MS = 86_400_000

const latestTiles: ComputedRef<TileItem[]> = computed(() => {
  const tiles: TileItem[] = []
  const w = journal.latestWeight
  const change = journal.change
  if (w) {
    tiles.push({
      key: 'weight',
      label: 'Weight',
      value: formatWeight(w.kg, settings.weightUnit),
      note:
        journal.weights.length > 1 && change
          ? formatWeightChange(change.changeKg, settings.weightUnit)
          : formatDate(w.measuredAt),
      to: { name: 'progress' },
    })
  }
  if (body.currentBmi.value !== null) {
    tiles.push({
      key: 'bmi',
      label: 'BMI',
      value: String(roundTo(body.currentBmi.value, 1)),
      note: body.band.value?.label,
      to: { name: 'progress' },
    })
  }
  const latestA1c = journal.glucose.find((g) => g.kind === 'a1c')
  if (latestA1c) {
    tiles.push({
      key: 'a1c',
      label: 'HbA1c',
      value: formatA1c(latestA1c.value, settings.a1cUnit),
      note: formatDate(latestA1c.measuredAt),
      to: { name: 'progress' },
    })
  }
  const latestGlucose = journal.glucose.find((g) => g.kind === 'glucose' || g.kind === 'daily')
  if (latestGlucose) {
    tiles.push({
      key: 'glucose',
      label: 'Glucose',
      value: formatGlucose(latestGlucose.value, settings.glucoseUnit),
      note:
        latestGlucose.kind === 'glucose'
          ? GLUCOSE_CONTEXT_LABELS[latestGlucose.context]
          : formatDate(latestGlucose.measuredAt),
      to: { name: 'progress' },
    })
  }
  const latestBp = journal.vitals.find((v) => v.kind === 'bp')
  if (latestBp?.kind === 'bp') {
    tiles.push({
      key: 'bp',
      label: 'BP',
      value: formatBloodPressure(latestBp.systolic, latestBp.diastolic),
      note: formatDate(latestBp.measuredAt),
      to: { name: 'progress' },
    })
  }
  const latestHr = journal.vitals.find((v) => v.kind === 'hr')
  if (latestHr?.kind === 'hr') {
    tiles.push({
      key: 'hr',
      label: 'Heart rate',
      value: formatHeartRate(latestHr.bpm),
      note: formatDate(latestHr.measuredAt),
      to: { name: 'progress' },
    })
  }
  const recentSymptoms = summarizeSymptoms(
    journal.symptoms.map((s) => ({ ...s, at: toEpochMs(s.occurredAt) })),
    shelf.draws.map((d) => toEpochMs(d.takenAt)),
    now.value - RECENT_DAYS * DAY_MS,
  )
  const symptomTotal = recentSymptoms.reduce((sum, s) => sum + s.count, 0)
  if (symptomTotal > 0 && recentSymptoms[0]) {
    tiles.push({
      key: 'symptoms',
      label: 'Side effects',
      value: String(symptomTotal),
      note: `${recentSymptoms[0].name} · 7 d`,
      to: { name: 'progress', hash: '#side-effects' },
    })
  }
  return tiles
})

const dueHeading = computed(() =>
  dueItems.value.some((i) => i.scheduled) ? 'Due' : 'In your system',
)

const hasSections = computed(
  () => dueItems.value.length > 0 || latestTiles.value.length > 0 || entries.value.length > 0,
)
</script>

<template>
  <div class="pc-page">
    <header class="mb-4">
      <p class="pc-eyebrow">Today</p>
      <h1 class="pc-display text-headline-large">{{ formatTodayDate(now) }}</h1>
    </header>

    <v-card v-if="isEmpty" class="pc-card-soft mb-4">
      <v-card-text class="pc-stack">
        <p class="text-title-large pc-display">Mix your first vial</p>
        <p>Work out the draw, then save the vial. Everything stays on this device.</p>
        <p class="text-body-small pc-muted d-flex align-center flex-wrap ga-1">
          <span>Units: {{ unitsSummary(settings.weightUnit, settings.heightUnit) }}.</span>
          <v-btn variant="text" :to="{ name: 'settings', hash: '#units' }">Change</v-btn>
        </p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            variant="flat"
            :to="{ name: 'calculator' }"
            :prepend-icon="mdiCalculatorVariantOutline"
          >
            Open the calculator
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card v-else-if="shelf.loaded && !hasSections" variant="tonal" class="mb-4">
      <v-card-text class="pc-stack pc-stack--tight">
        <p>Nothing due yet. Add a schedule on your stack or log a draw.</p>
        <div>
          <v-btn variant="text" :to="{ name: 'stack' }" :append-icon="mdiChevronRight">
            Stack
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <div
      v-if="hasSections"
      :class="['today-sections', { 'today-sections--with-due': dueItems.length > 0 }]"
    >
      <section
        v-if="dueItems.length"
        class="pc-stack pc-stack--tight"
        aria-labelledby="due-heading"
      >
        <h2 id="due-heading" class="pc-display text-title-large">{{ dueHeading }}</h2>
        <div class="pc-stack">
          <DueCard
            v-for="item in dueItems"
            :key="item.id"
            :title="item.title"
            :due-label="item.dueLabel"
            :due-tone="item.dueTone"
            :detail="item.detail"
            :trace="item.trace"
            :level="item.level"
            :can-log="item.canLog"
            :to="item.to"
            @log="item.log()"
          >
            <template v-if="item.dueAt !== null" #countdown>
              <DoseCountdown
                :state="dueState(item.dueAt, item.gapHours, now)"
                :remaining="remainingFraction(item.dueAt, item.gapHours, now)"
              />
            </template>
            <template v-if="item.vialId" #actions>
              <v-btn
                variant="tonal"
                :prepend-icon="mdiCalculatorVariantOutline"
                :to="{ name: 'calculator', query: { vial: item.vialId } }"
              >
                Calculate
              </v-btn>
            </template>
          </DueCard>
        </div>
      </section>

      <div v-if="latestTiles.length || entries.length" class="today-side">
        <section
          v-if="latestTiles.length"
          class="pc-stack pc-stack--tight"
          aria-labelledby="latest-heading"
        >
          <h2 id="latest-heading" class="pc-display text-title-large">Latest</h2>
          <div class="tile-grid">
            <StatTile
              v-for="tile in latestTiles"
              :key="tile.key"
              :label="tile.label"
              :value="tile.value"
              :note="tile.note"
              :to="tile.to"
            />
          </div>
        </section>

        <section
          v-if="entries.length"
          class="pc-stack pc-stack--tight"
          aria-labelledby="recent-heading"
        >
          <h2 id="recent-heading" class="pc-display text-title-large">Recent</h2>
          <v-card>
            <v-card-text class="pc-stack pc-stack--tight">
              <EntriesTimeline :entries="entries" compact :limit="5" />
              <div>
                <v-btn variant="text" :to="{ name: 'entries' }" :append-icon="mdiChevronRight">
                  All entries
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.today-sections {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: start;
}

.today-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

@media (min-width: 840px) {
  .today-sections {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .today-sections--with-due {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  }

  .today-sections:not(.today-sections--with-due) .today-side {
    display: contents;
  }
}

.tile-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
</style>
