<script setup lang="ts">
import type { SortDirection } from '@/domain/listing'
import { mdiSortCalendarAscending, mdiSortCalendarDescending } from '@/plugins/icons'

defineProps<{ label: string }>()
const direction = defineModel<SortDirection>({ required: true })
</script>

<template>
  <v-btn-toggle
    v-model="direction"
    role="group"
    mandatory
    density="comfortable"
    :aria-label="label"
  >
    <v-btn value="desc" :prepend-icon="mdiSortCalendarDescending">Newest first</v-btn>
    <v-btn value="asc" :prepend-icon="mdiSortCalendarAscending">Oldest first</v-btn>
  </v-btn-toggle>
</template>
