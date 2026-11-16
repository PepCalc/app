<script setup lang="ts">
import { useEntries } from '@/composables/useEntries'
import EntriesTimeline from '@/components/journal/EntriesTimeline.vue'
import { mdiChevronLeft } from '@/plugins/icons'

const { entries } = useEntries()
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
      <p class="pc-eyebrow">Everything you’ve logged</p>
      <h1 class="pc-display text-headline-large">All entries</h1>
    </header>

    <EntriesTimeline :entries="entries" />
  </div>
</template>

<style scoped>
.back {
  margin-inline-start: -12px;
}
</style>
