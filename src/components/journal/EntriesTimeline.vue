<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { filterEntries, groupByDay, type Entry, type EntryKind } from '@/domain/entries'
import { sortByTime, type SortDirection } from '@/domain/listing'
import { useNow } from '@/composables/useNow'
import { usePaging } from '@/composables/usePaging'
import { atLocalTime, formatDay } from '@/services/time'
import ListPager from '@/components/common/ListPager.vue'
import SortToggle from '@/components/common/SortToggle.vue'
import EntryKindFilter from './EntryKindFilter.vue'
import EntryRow from './EntryRow.vue'

const props = defineProps<{
  entries: readonly Entry[]
  /** Kinds offered as filter chips; defaults to all kinds in LOG_KINDS. */
  kinds?: readonly EntryKind[]
  /** Compact mode for summary sections: hides chips, sort toggle and pager. */
  compact?: boolean
  /** Maximum rows shown in compact mode. */
  limit?: number
}>()

const selectedKinds = defineModel<EntryKind[]>('selectedKinds', { default: () => [] })
const now = useNow()
const direction = ref<SortDirection>('desc')

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
          <EntryKindFilter v-model="selectedKinds" :entries="entries" :kinds="kinds" />
          <SortToggle v-model="direction" label="Order" />
        </template>

        <p v-if="!visible.length" class="pc-muted">Nothing here yet.</p>
        <div v-else class="pc-stack">
          <section v-for="group in groups" :key="group.day" class="day-group">
            <h3 class="text-title-small pc-muted day-heading">
              {{ formatDay(group.day, now) }}
            </h3>
            <v-list class="bg-transparent pa-0" density="comfortable">
              <EntryRow
                v-for="entry in group.entries"
                :key="`${entry.kind}:${entry.id}`"
                :entry="entry"
              />
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
</style>
