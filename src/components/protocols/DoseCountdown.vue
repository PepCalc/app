<script setup lang="ts">
import { computed } from 'vue'
import type { DueState } from '@/domain/schedule'

/**
 * A ring that empties as the next dose of a protocol comes due, with the time left in its centre. It is
 * decorative: the line of text beside it carries the same reading for assistive technology.
 */
const props = defineProps<{
  state: DueState
  /** Share of the interval still to run, 0 to 1. */
  remaining: number
}>()

const SIZE = 64
const STROKE = 6
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Once due, the ring is drawn whole so it reads as ready rather than as empty. */
const due = computed(() => props.state.kind === 'due' || props.state.kind === 'late')
const offset = computed(() => (due.value ? 0 : CIRCUMFERENCE * (1 - props.remaining)))

const label = computed<{ value: string; unit: string }>(() => {
  const s = props.state
  switch (s.kind) {
    case 'later':
      return { value: String(s.days), unit: s.days === 1 ? 'day' : 'days' }
    case 'soon':
      return { value: String(s.hours), unit: s.hours === 1 ? 'hour' : 'hours' }
    case 'minutes':
      return { value: String(s.minutes), unit: 'min' }
    case 'due':
    case 'late':
      return { value: 'Now', unit: '' }
  }
  return { value: '', unit: '' }
})
</script>

<template>
  <div class="dose-countdown" aria-hidden="true">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" :width="SIZE" :height="SIZE">
      <circle
        class="dose-countdown__track"
        :cx="SIZE / 2"
        :cy="SIZE / 2"
        :r="RADIUS"
        :stroke-width="STROKE"
      />
      <circle
        :class="['dose-countdown__arc', { 'dose-countdown__arc--due': due }]"
        :cx="SIZE / 2"
        :cy="SIZE / 2"
        :r="RADIUS"
        :stroke-width="STROKE"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="offset"
      />
    </svg>
    <span class="dose-countdown__label">
      <span class="dose-countdown__value pc-num">{{ label.value }}</span>
      <span v-if="label.unit" class="dose-countdown__unit">{{ label.unit }}</span>
    </span>
  </div>
</template>

<style scoped>
.dose-countdown {
  position: relative;
  flex: none;
  width: 64px;
  height: 64px;
}

.dose-countdown svg {
  display: block;
  /* Start the arc at twelve o'clock and run it clockwise. */
  transform: rotate(-90deg);
}

.dose-countdown circle {
  fill: none;
}

.dose-countdown__track {
  stroke: var(--pc-divider);
}

.dose-countdown__arc {
  stroke: var(--pc-brand);
  stroke-linecap: round;
  transition: stroke-dashoffset var(--pc-dur-base) var(--pc-ease-standard);
}

.dose-countdown__arc--due {
  stroke: var(--pc-accent);
}

.dose-countdown__label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
  color: var(--pc-text-1);
}

.dose-countdown__value {
  font-size: 1.125rem;
  font-weight: 600;
}

.dose-countdown__unit {
  font-size: 0.6875rem;
  color: var(--pc-text-2);
}
</style>
