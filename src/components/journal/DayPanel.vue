<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '@/domain/entries'
import { useNow } from '@/composables/useNow'
import { atLocalTime, formatDate, formatDay } from '@/services/time'
import { useLogStore } from '@/stores/log'
import { usePhotosStore } from '@/stores/photos'
import { mdiPlus } from '@/plugins/icons'
import EntryRow from './EntryRow.vue'

const props = defineProps<{
  day: number
  entries: readonly Entry[]
  scheduled: readonly string[]
  canLog: boolean
}>()

const now = useNow()
const log = useLogStore()
const photos = usePhotosStore()

const heading = computed(() => formatDay(props.day, now.value))
const sortedEntries = computed(() => [...props.entries].sort((a, b) => a.at - b.at))
const photoEntries = computed(() => sortedEntries.value.filter((e) => e.kind === 'photo'))

function logForDay() {
  const today = atLocalTime(now.value, 0, 0, 0)
  const at = props.day === today ? now.value : atLocalTime(props.day, 0, 12, 0)
  log.openSheet({ at })
}
</script>

<template>
  <v-card class="day-panel">
    <v-card-item>
      <v-card-title>{{ heading }}</v-card-title>
    </v-card-item>
    <v-card-text class="pc-stack">
      <div v-if="photoEntries.length" class="photo-row" role="list" aria-label="Photos that day">
        <button
          v-for="entry in photoEntries"
          :key="entry.id"
          type="button"
          class="photo-thumb"
          :aria-label="`${entry.title} from ${formatDate(entry.at)}`"
          @click="log.edit(entry)"
        >
          <img v-if="photos.thumbUrls[entry.id]" :src="photos.thumbUrls[entry.id]" alt="" />
        </button>
      </div>

      <v-list v-if="sortedEntries.length" class="bg-transparent pa-0" density="comfortable">
        <EntryRow
          v-for="entry in sortedEntries"
          :key="`${entry.kind}:${entry.id}`"
          :entry="entry"
        />
      </v-list>
      <p v-else class="pc-muted">{{ canLog ? 'Nothing logged.' : 'Nothing logged yet.' }}</p>

      <div v-if="scheduled.length" class="pc-stack pc-stack--tight">
        <p v-for="(item, index) in scheduled" :key="index" class="text-body-medium pc-muted">
          Scheduled: {{ item }}
        </p>
      </div>

      <div v-if="canLog">
        <v-btn color="primary" variant="tonal" :prepend-icon="mdiPlus" @click="logForDay">
          Log for this day
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.photo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.photo-thumb {
  width: 64px;
  height: 84px;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: var(--pc-radius-sm);
  overflow: hidden;
  background: var(--pc-surface-sunk);
  cursor: pointer;
}

.photo-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
