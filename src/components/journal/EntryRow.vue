<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '@/domain/entries'
import { LOG_KINDS } from '@/logKinds'
import { formatTime } from '@/services/time'
import { useLogStore } from '@/stores/log'

const props = defineProps<{
  entry: Entry
}>()

const log = useLogStore()
const kindMeta = new Map(LOG_KINDS.map((k) => [k.kind, k]))
const icon = computed(() => kindMeta.get(props.entry.kind)?.icon)
</script>

<template>
  <div role="listitem">
    <v-list-item
      tag="button"
      type="button"
      role="button"
      tabindex="0"
      class="entry-row"
      :prepend-icon="icon"
      :subtitle="entry.detail || undefined"
      @click="log.edit(entry)"
    >
      <v-list-item-title class="pc-num">{{ entry.title }}</v-list-item-title>
      <p v-if="entry.notes" class="text-body-small pc-muted entry-note">
        {{ entry.notes }}
      </p>
      <template #append>
        <span class="text-body-small pc-muted pc-num entry-time">{{ formatTime(entry.at) }}</span>
      </template>
    </v-list-item>
  </div>
</template>

<style scoped>
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
