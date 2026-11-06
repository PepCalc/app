<script setup lang="ts">
import { computed, useId } from 'vue'
import type { LevelTrace, TracePoint } from '@/domain/projection'

/**
 * A card's estimated levels drawn behind its content: logged history as a solid line over a soft
 * fill, the projection dashed and fading out, and a dot at now. Decorative, so it is hidden from
 * assistive technology and the card says the same in text. Fills the bottom `--level-band` of the
 * card at z-index -1, so the card must form a stacking context (`isolation: isolate`) and leave
 * the band clear of text.
 */
const props = defineProps<{
  trace: LevelTrace
  /** The card is in front: the dot pulses and the line draws in as it arrives. */
  active: boolean
}>()

const fillId = useId()
const fadeId = useId()

/** Peaks stop short of the top edge, where the stroke would clip. */
const HEADROOM = 0.92

const px = ([x, y]: TracePoint) =>
  `${(x * 100).toFixed(2)} ${(100 - y * 100 * HEADROOM).toFixed(2)}`
const line = (points: readonly TracePoint[]) =>
  points.length ? `M${points.map(px).join('L')}` : ''
const area = (points: readonly TracePoint[]) => {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return `${line(points)}L${(last[0] * 100).toFixed(2)} 100L${(first[0] * 100).toFixed(2)} 100Z`
}

const nowX = computed(() => props.trace.now[0] * 100)
const dotStyle = computed(() => ({
  left: `${nowX.value}%`,
  bottom: `${props.trace.now[1] * 100 * HEADROOM}%`,
}))
const nowOffset = computed(() => props.trace.now[0])
</script>

<template>
  <div class="level-backdrop" aria-hidden="true">
    <svg
      :key="String(active)"
      class="level-backdrop__plot"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" class="level-backdrop__fill" />
          <stop :offset="nowOffset" class="level-backdrop__fill" />
          <stop offset="1" class="level-backdrop__fill level-backdrop__fill--end" />
        </linearGradient>
        <linearGradient
          :id="fadeId"
          gradientUnits="userSpaceOnUse"
          :x1="nowX"
          y1="0"
          x2="100"
          y2="0"
        >
          <stop offset="0" class="level-backdrop__fade" />
          <stop offset="1" class="level-backdrop__fade level-backdrop__fade--end" />
        </linearGradient>
      </defs>
      <path :d="area([...trace.past, ...trace.future])" :fill="`url(#${fillId})`" />
      <path class="level-backdrop__line" :d="line(trace.past)" />
      <path
        class="level-backdrop__line level-backdrop__line--future"
        :d="line(trace.future)"
        :style="{ stroke: `url(#${fadeId})` }"
      />
    </svg>
    <span
      :class="['level-backdrop__dot', { 'level-backdrop__dot--live': active }]"
      :style="dotStyle"
    />
  </div>
</template>

<style scoped>
.level-backdrop {
  position: absolute;
  inset: auto 0 0;
  z-index: -1;
  height: var(--level-band, 128px);
  pointer-events: none;
}

/* The fill and line melt into the card towards the bottom edge, so no baseline shows. */
.level-backdrop__plot {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  -webkit-mask-image: linear-gradient(to bottom, var(--pc-surface) 45%, transparent);
  mask-image: linear-gradient(to bottom, var(--pc-surface) 45%, transparent);
  animation: level-reveal 900ms var(--pc-ease-standard) both;
}

.level-backdrop__fill {
  stop-color: var(--pc-chart-logged);
  stop-opacity: 0.16;
}

.level-backdrop__fill--end {
  stop-opacity: 0.04;
}

.level-backdrop__fade {
  stop-color: var(--pc-chart-logged);
  stop-opacity: 0.7;
}

.level-backdrop__fade--end {
  stop-opacity: 0.15;
}

.level-backdrop__line {
  fill: none;
  stroke: var(--pc-chart-logged);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: 0.7;
}

.level-backdrop__line--future {
  stroke-dasharray: 2 5;
  opacity: 1;
}

.level-backdrop__dot {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: 0 0 -4px -4px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-chart-logged);
  box-shadow: 0 0 0 2px var(--pc-surface);
}

.level-backdrop__dot--live::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: inherit;
  animation: level-pulse 2.4s var(--pc-ease-standard) infinite;
}

/* The app's reduced-motion rule only shortens animations, which would strobe an infinite one. */
@media (prefers-reduced-motion: reduce) {
  .level-backdrop__dot--live::after {
    animation: none;
    opacity: 0;
  }
}

@keyframes level-reveal {
  from {
    clip-path: inset(-10% 100% -10% 0);
  }
  to {
    clip-path: inset(-10% 0 -10% 0);
  }
}

@keyframes level-pulse {
  from {
    transform: scale(1);
    opacity: 0.5;
  }
  70%,
  to {
    transform: scale(3.2);
    opacity: 0;
  }
}
</style>
