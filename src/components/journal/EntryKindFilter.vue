<script setup lang="ts">
import { computed } from 'vue'
import { countByKind, type Entry, type EntryKind } from '@/domain/entries'
import { LOG_KINDS } from '@/logKinds'

const props = defineProps<{
  entries: readonly Entry[]
  /** Kinds offered as filter chips; defaults to all kinds in LOG_KINDS. */
  kinds?: readonly EntryKind[]
}>()

const selectedKinds = defineModel<EntryKind[]>({ required: true })

const offeredKinds = computed(() =>
  props.kinds ? LOG_KINDS.filter((k) => props.kinds!.includes(k.kind)) : LOG_KINDS,
)
const counts = computed(() => countByKind(props.entries))

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
</script>

<template>
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
</template>
