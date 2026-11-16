<script setup lang="ts">
import type { Page } from '@/domain/listing'

defineProps<{
  current: Page<unknown>
  /** Plural noun for the range caption: "items", "entries". */
  noun: string
}>()
const page = defineModel<number>({ required: true })
</script>

<template>
  <nav v-if="current.pageCount > 1" class="list-pager" :aria-label="`${noun} pages`">
    <p class="text-body-small pc-muted pc-num" aria-live="polite">
      {{ current.first }}–{{ current.last }} of {{ current.total }} {{ noun }}
    </p>
    <v-pagination
      v-model="page"
      :length="current.pageCount"
      :total-visible="5"
      density="comfortable"
    />
  </nav>
</template>

<style scoped>
.list-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
