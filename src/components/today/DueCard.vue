<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { brand } from '@/brand'
import type { DueTone } from '@/domain/due'
import type { LevelTrace } from '@/domain/projection'
import LevelBackdrop from '@/components/charts/LevelBackdrop.vue'
import { mdiChevronRight, mdiNeedle } from '@/plugins/icons'

export interface DueCardLevel {
  amountText: string
  percentOfPeak: number
  stat?: { label: string; value: string }
  userSupplied?: boolean
}

const props = withDefaults(
  defineProps<{
    title: string
    detail: string
    to: RouteLocationRaw
    dueLabel?: string
    dueTone?: DueTone
    trace?: LevelTrace | null
    level?: DueCardLevel | null
    canLog?: boolean
  }>(),
  {
    dueLabel: undefined,
    dueTone: 'muted',
    trace: null,
    level: null,
    canLog: true,
  },
)

const emit = defineEmits<{ log: [] }>()

const badgeClass = computed(() => {
  switch (props.dueTone) {
    case 'brand':
      return 'pc-badge--brand'
    case 'notice':
      return 'pc-badge--notice'
    case 'alert':
      return 'pc-badge--alert'
    default:
      return ''
  }
})
</script>

<template>
  <v-card :class="['due-card', { 'due-card--with-trace': Boolean(trace) }]">
    <LevelBackdrop v-if="trace" :trace="trace" active />
    <v-card-text class="due-card__body pc-stack">
      <div class="due-card__header">
        <div class="due-card__info pc-stack pc-stack--tight">
          <div class="due-card__title-row">
            <router-link :to="to" class="due-card__title pc-display">{{ title }}</router-link>
            <span v-if="dueLabel" :class="['pc-badge', badgeClass]">
              <span v-if="dueTone !== 'muted'" class="pc-badge__dot" />{{ dueLabel }}
            </span>
          </div>
          <p class="due-card__detail pc-muted pc-num">{{ detail }}</p>
        </div>
        <div v-if="$slots.countdown" class="due-card__countdown">
          <slot name="countdown" />
        </div>
      </div>

      <div v-if="level" class="due-card__levels">
        <div class="due-card__metrics">
          <div class="due-card__metric">
            <span class="due-card__metric-label">Est. level</span>
            <span class="due-card__metric-value pc-num">{{ level.amountText }}</span>
          </div>
          <div class="due-card__metric">
            <span class="due-card__metric-label">Of peak</span>
            <span class="due-card__metric-value pc-num">{{ level.percentOfPeak }}%</span>
          </div>
          <div v-if="level.stat" class="due-card__metric">
            <span class="due-card__metric-label">{{ level.stat.label }}</span>
            <span class="due-card__metric-value pc-num">{{ level.stat.value }}</span>
          </div>
        </div>
        <span v-if="level.userSupplied" class="pc-badge pc-badge--notice due-card__own-badge">
          <span class="pc-badge__dot" />Your values
        </span>
      </div>

      <div v-if="trace" class="due-card__band" aria-hidden="true" />

      <div class="due-card__actions">
        <v-btn variant="text" :to="to" :append-icon="mdiChevronRight" class="due-card__open">
          {{ brand.dueOpenLabel }}
        </v-btn>
        <div class="due-card__cta">
          <slot name="actions" />
          <v-btn
            v-if="canLog"
            color="primary"
            variant="flat"
            :prepend-icon="mdiNeedle"
            @click="emit('log')"
          >
            {{ brand.logDoseLabel }}
          </v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.due-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.due-card--with-trace {
  --level-band: 176px;
}

.due-card__body {
  position: relative;
}

.due-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 16px;
}

.due-card__info {
  min-width: 0;
  flex: 1 1 auto;
}

.due-card__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.due-card__title {
  display: inline-block;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--pc-text-1);
  text-decoration: none;
}

.due-card__title:hover {
  text-decoration: underline;
}

.due-card__detail {
  font-size: 0.875rem;
}

.due-card__countdown {
  flex: none;
}

.due-card__levels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 10px 14px;
  background-color: var(--pc-glass-strong);
  border: 1px solid var(--pc-glass-edge);
  border-radius: var(--pc-radius-md);
}

.due-card__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px 24px;
}

.due-card__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.due-card__metric-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pc-text-3);
}

.due-card__metric-value {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--pc-text-1);
}

.due-card__own-badge {
  flex: none;
}

.due-card__band {
  height: 56px;
}

.due-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.due-card--with-trace .due-card__actions {
  margin: 0 -16px -16px;
  padding: 12px 16px 16px;
  background: linear-gradient(to bottom, transparent, var(--pc-surface) 32%);
}

.due-card__cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
