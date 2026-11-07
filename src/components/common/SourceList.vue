<script setup lang="ts">
import { ref, useId } from 'vue'
import type { SourceRef } from '@/domain/catalog'
import SourceBadge from './SourceBadge.vue'

/**
 * Citations behind a card's figures, collapsed behind a toggle so they don't crowd the text.
 * `note` is how the figures were taken from those sources; it folds away with them. `flat` drops
 * the toggle for a list that already sits inside something folded.
 */
const props = defineProps<{ sources: readonly SourceRef[]; note?: string; flat?: boolean }>()

const open = ref(props.flat)
const listId = useId()
</script>

<template>
  <div v-if="sources.length">
    <v-btn
      v-if="!flat"
      variant="text"
      size="small"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="open = !open"
    >
      {{ open ? 'Hide sources' : `Sources (${sources.length})` }}
    </v-btn>
    <v-expand-transition>
      <div v-show="open" :id="listId" :class="['source-panel', { 'source-panel--flat': flat }]">
        <p v-if="note" class="text-body-small pc-muted">{{ note }}</p>
        <ul class="source-list">
          <li v-for="source in sources" :key="source.citation" class="text-body-small">
            <SourceBadge :kind="source.kind" />
            <a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{
              source.citation
            }}</a>
            <span v-else>{{ source.citation }}</span>
          </li>
        </ul>
      </div>
    </v-expand-transition>
  </div>
</template>

<style scoped>
.source-panel {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.source-panel--flat {
  margin-top: 0;
}

.source-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.source-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
