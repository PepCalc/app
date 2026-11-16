<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { filterEntries, type EntryKind } from '@/domain/entries'
import { entriesOn } from '@/domain/entryDays'
import { useEntries } from '@/composables/useEntries'
import { useNow } from '@/composables/useNow'
import { useScheduledDays } from '@/composables/useScheduledDays'
import { atLocalTime } from '@/services/time'
import DayPanel from '@/components/journal/DayPanel.vue'
import EntriesCalendar from '@/components/journal/EntriesCalendar.vue'
import EntriesTimeline from '@/components/journal/EntriesTimeline.vue'
import EntryKindFilter from '@/components/journal/EntryKindFilter.vue'
import { mdiChevronLeft } from '@/plugins/icons'

const route = useRoute()
const router = useRouter()
const { entries } = useEntries()
const now = useNow()

const view = computed<'list' | 'calendar'>({
  get: () => (route.query.view === 'calendar' ? 'calendar' : 'list'),
  set: (next) => {
    const query = { ...route.query }
    if (next === 'calendar') query.view = 'calendar'
    else delete query.view
    void router.replace({ query })
  },
})

const selectedKinds = ref<EntryKind[]>([])
const filteredEntries = computed(() => filterEntries(entries.value, new Set(selectedKinds.value)))
const includeScheduled = computed(
  () => selectedKinds.value.length === 0 || selectedKinds.value.includes('dose'),
)

const todayStart = computed(() => atLocalTime(now.value, 0, 0, 0))
const selectedDay = ref(todayStart.value)
const { scheduledIn, lastSelectable } = useScheduledDays(now)

const dayStart = (at: number) => atLocalTime(at, 0, 0, 0)
const scheduledItems = computed(() =>
  includeScheduled.value
    ? scheduledIn(todayStart.value, atLocalTime(lastSelectable.value, 1, 0, 0))
    : [],
)
const scheduledTimes = computed(() => scheduledItems.value.map((s) => s.at))
const dayEntries = computed(() => entriesOn(filteredEntries.value, selectedDay.value, dayStart))
const dayScheduled = computed(() => {
  if (!includeScheduled.value) return []
  if (dayEntries.value.some((e) => e.kind === 'dose')) return []
  return scheduledItems.value
    .filter((s) => dayStart(s.at) === selectedDay.value)
    .map((s) => s.label)
})
const canLogSelected = computed(() => selectedDay.value <= todayStart.value)
</script>

<template>
  <div class="pc-page">
    <header class="mb-4">
      <v-btn
        :to="{ name: 'progress' }"
        :prepend-icon="mdiChevronLeft"
        variant="text"
        class="mb-2 back"
      >
        Progress
      </v-btn>
      <div class="header-row">
        <h1 class="pc-display text-headline-large">All entries</h1>
        <v-btn-toggle v-model="view" mandatory role="group" aria-label="View">
          <v-btn value="list">List</v-btn>
          <v-btn value="calendar">Calendar</v-btn>
        </v-btn-toggle>
      </div>
    </header>

    <EntriesTimeline
      v-if="view === 'list'"
      v-model:selected-kinds="selectedKinds"
      :entries="entries"
    />

    <div v-else class="pc-stack">
      <v-card v-if="entries.length">
        <v-card-text>
          <EntryKindFilter v-model="selectedKinds" :entries="entries" />
        </v-card-text>
      </v-card>

      <div class="calendar-layout">
        <EntriesCalendar
          v-model="selectedDay"
          :entries="filteredEntries"
          :scheduled-at="scheduledTimes"
          :last-selectable="lastSelectable"
        />
        <DayPanel
          :day="selectedDay"
          :entries="dayEntries"
          :scheduled="dayScheduled"
          :can-log="canLogSelected"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.back {
  margin-inline-start: -12px;
}

.header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.calendar-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

@media (min-width: 840px) {
  .calendar-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>
