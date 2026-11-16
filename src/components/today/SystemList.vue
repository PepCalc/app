<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { TracePoint } from '@/domain/projection'
import { mdiChevronRight } from '@/plugins/icons'

export interface SystemRow {
  key: string
  label: string
  amountText: string
  percentOfPeak: number
  trace: TracePoint[]
  to: RouteLocationRaw
}

defineProps<{ rows: readonly SystemRow[] }>()

const HEADROOM = 0.88
const px = ([x, y]: TracePoint) =>
  `${(x * 100).toFixed(2)} ${(100 - y * 100 * HEADROOM).toFixed(2)}`
const linePath = (points: readonly TracePoint[]) =>
  points.length ? `M${points.map(px).join('L')}` : ''
const areaPath = (points: readonly TracePoint[]) => {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return `${linePath(points)}L${(last[0] * 100).toFixed(2)} 100L${(first[0] * 100).toFixed(2)} 100Z`
}
</script>

<template>
  <section v-if="rows.length" class="pc-stack pc-stack--tight" aria-labelledby="system-heading">
    <h2 id="system-heading" class="pc-display text-title-large">In your system</h2>

    <v-card>
      <v-list density="comfortable" class="bg-transparent pa-0">
        <v-list-item v-for="row in rows" :key="row.key" :to="row.to" class="system-row">
          <v-list-item-title class="system-row__title">{{ row.label }}</v-list-item-title>
          <v-list-item-subtitle class="system-row__sub pc-num">
            <span>{{ row.amountText }}</span>
            <span class="pc-muted">{{ row.percentOfPeak }}% of peak</span>
          </v-list-item-subtitle>
          <template #append>
            <svg
              v-if="row.trace.length"
              class="system-row__trace"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path class="system-row__fill" :d="areaPath(row.trace)" />
              <path class="system-row__line" :d="linePath(row.trace)" />
            </svg>
            <v-icon :icon="mdiChevronRight" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </section>
</template>

<style scoped>
.system-row {
  min-height: 56px;
}

.system-row__title {
  font-weight: 600;
}

.system-row__sub {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.system-row__trace {
  width: 64px;
  height: 24px;
  margin-inline-end: 8px;
  overflow: visible;
  flex: none;
}

.system-row__fill {
  fill: var(--pc-chart-logged);
  opacity: 0.16;
}

.system-row__line {
  fill: none;
  stroke: var(--pc-chart-logged);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
