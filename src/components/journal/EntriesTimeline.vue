<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  countByKind,
  filterEntries,
  groupByDay,
  type Entry,
  type EntryKind,
} from '@/domain/entries'
import { sortByTime, type SortDirection } from '@/domain/listing'
import { LOG_KINDS } from '@/logKinds'
import { useNow } from '@/composables/useNow'
import { usePaging } from '@/composables/usePaging'
import { atLocalTime, formatDay, formatTime } from '@/services/time'
import { useLogStore } from '@/stores/log'
import ListPager from '@/components/common/ListPager.vue'
import SortToggle from '@/components/common/SortToggle.vue'

const props = defineProps<{
  entries: readonly Entry[]
  /** Kinds offered as filter chips; defaults to all kinds in LOG_KINDS. */
  kinds?: readonly EntryKind[]
  /** Compact mode for summary sections: hides chips, sort toggle and pager. */
  compact?: boolean
  /** Maximum rows shown in compact mode. */
  limit?: number
}>()

const log = useLogStore()
const now = useNow()

const kindMeta = new Map(LOG_KINDS.map((k) => [k.kind, k]))
const offeredKinds = computed(() =>
  props.kinds ? LOG_KINDS.filter((k) => props.kinds!.includes(k.kind)) : LOG_KINDS,
)
const counts = computed(() => countByKind(props.entries))

const selectedKinds = ref<EntryKind[]>([])
const direction = ref<SortDirection>('desc')

const chipValue = computed<(EntryKind | 'all')[]>(() =>
  selectedKinds.value.length === 0 ? ['all'] : selectedKinds.value,
)

function onChipChange(next: (EntryKind | 'all')[]) {
  const hadAll = selectedKinds.value.length === 0
  if (!hadAll && next.includes('all')) {
    selectedKinds.value = []
    return
  }
  selectedKinds.value = next.filter((k): k is EntryKind => k !== 'all')
}

const filtered = computed(() => {
  const picked = props.compact ? new Set<EntryKind>() : new Set(selectedKinds.value)
  const matching = filterEntries(props.entries, picked)
  return sortByTime(matching, (e) => e.at, props.compact ? 'desc' : direction.value)
})

const paging = usePaging(filtered)
watch([selectedKinds, direction], () => paging.reset())

const visible = computed(() =>
  props.compact
    ? props.limit !== undefined
      ? filtered.value.slice(0, props.limit)
      : filtered.value
    : paging.current.value.items,
)

const dayStart = (at: number) => atLocalTime(at, 0, 0, 0)
const groups = computed(() =>
  groupByDay(visible.value, dayStart, props.compact ? 'desc' : direction.value),
)
</script>

<template>
  <component :is="compact ? 'div' : 'v-card'" class="entries-timeline">
    <component :is="compact ? 'div' : 'v-card-text'" class="pc-stack">
      <p v-if="!entries.length" class="pc-muted">Nothing logged yet.</p>
      <template v-else>
        <template v-if="!compact">
          <v-chip-group
            v-if="offeredKinds.length > 1"
            :model-value="chipValue"
            multiple
            column
            color="primary"
            aria-label="Filter by kind"
            @update:model-value="onChipChange"
          >
            <v-chip value="all" tag="button" filter :aria-pressed="selectedKinds.length === 0">
              All <span class="pc-num ml-1">{{ entries.length }}</span>
            </v-chip>
            <template v-for="k in offeredKinds" :key="k.kind">
              <v-chip
                v-if="counts[k.kind] > 0"
                :value="k.kind"
                tag="button"
                filter
                :aria-pressed="selectedKinds.includes(k.kind)"
              >
                {{ k.plural }} <span class="pc-num ml-1">{{ counts[k.kind] }}</span>
              </v-chip>
            </template>
          </v-chip-group>
          <SortToggle v-model="direction" label="Order" />
        </template>

        <p v-if="!visible.length" class="pc-muted">Nothing here yet.</p>
        <div v-else class="pc-stack">
          <section v-for="group in groups" :key="group.day" class="day-group">
            <h3 class="text-title-small pc-muted day-heading">
              {{ formatDay(group.day, now) }}
            </h3>
            <v-list class="bg-transparent pa-0" density="comfortable">
              <div
                v-for="entry in group.entries"
                :key="`${entry.kind}:${entry.id}`"
                role="listitem"
              >
                <v-list-item
                  tag="button"
                  type="button"
                  role="button"
                  tabindex="0"
                  class="entry-row"
                  :prepend-icon="kindMeta.get(entry.kind)?.icon"
                  :subtitle="entry.detail || undefined"
                  @click="log.edit(entry)"
                >
                  <v-list-item-title class="pc-num">{{ entry.title }}</v-list-item-title>
                  <p v-if="entry.notes" class="text-body-small pc-muted entry-note">
                    {{ entry.notes }}
                  </p>
                  <template #append>
                    <span class="text-body-small pc-muted pc-num entry-time">{{
                      formatTime(entry.at)
                    }}</span>
                  </template>
                </v-list-item>
              </div>
            </v-list>
          </section>
        </div>

        <ListPager
          v-if="!compact"
          v-model="paging.state.page"
          :current="paging.current.value"
          noun="entries"
        />
      </template>
    </component>
  </component>
</template>

<style scoped>
.day-heading {
  margin-bottom: 4px;
}

.entry-row {
  width: 100%;
  text-align: start;
}

.entry-note {
  white-space: pre-wrap;
}

.entry-time {
  white-space: nowrap;
}
</style>
