<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { brand } from '@/brand'
import { mdiNeedle } from '@/plugins/icons'

defineProps<{
  title: string
  detail: string
  to: RouteLocationRaw
  dueLabel?: string
}>()

const emit = defineEmits<{ log: [] }>()
</script>

<template>
  <v-card class="due-card">
    <v-card-text class="due-card__body">
      <div class="due-card__main">
        <div v-if="$slots.countdown" class="due-card__countdown">
          <slot name="countdown" />
        </div>
        <div class="due-card__info">
          <router-link :to="to" class="due-card__title pc-display">{{ title }}</router-link>
          <p v-if="dueLabel" class="due-card__due">{{ dueLabel }}</p>
          <p class="due-card__detail pc-muted pc-num">{{ detail }}</p>
        </div>
      </div>
      <div class="due-card__actions">
        <slot name="actions" />
        <v-btn color="primary" variant="flat" :prepend-icon="mdiNeedle" @click="emit('log')">
          {{ brand.logDoseLabel }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.due-card__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
}

.due-card__main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1 1 200px;
}

.due-card__countdown {
  flex: none;
}

.due-card__info {
  min-width: 0;
}

.due-card__title {
  display: inline-block;
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--pc-text-1);
  text-decoration: none;
}

.due-card__title:hover {
  text-decoration: underline;
}

.due-card__due {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--pc-text-1);
}

.due-card__detail {
  font-size: 0.8125rem;
}

.due-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
