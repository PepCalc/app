<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { DoseEvent, PkParameters } from '@/domain/pk'
import { useChartColors } from '@/composables/useChartColors'
import { formatShort } from '@/services/time'
import { levelsModel } from '@/domain/levels'
import { formatAmount } from '@/domain/units'
import { levelsOption } from './levelsChart'

use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const props = defineProps<{
  params: PkParameters
  /** Logged doses, already converted to `unitLabel`. */
  doses: DoseEvent[]
  /** The draw being calculated, shown as a dashed projection; null when only history is shown. */
  preview: DoseEvent | null
  unitLabel: string
  now: number
  /** Limits history for frequently dosed products. */
  lookbackHours?: number
}>()

const { colors } = useChartColors()

const model = computed(() => levelsModel(props))
const summary = computed(() => model.value.summary)
const option = computed(() => levelsOption(props, model.value, colors.value))

const fmt = (v: number) => formatAmount(v, props.unitLabel)

const ariaSummary = computed(() => {
  const { now, peak, clearsAt } = summary.value
  const parts = [`Estimated amount in the body now: ${fmt(now)}.`]
  if (peak) parts.push(`Peak ${fmt(peak.amount)} around ${formatShort(peak.at)}.`)
  if (clearsAt) parts.push(`Below 10% of peak by ${formatShort(clearsAt)}.`)
  return parts.join(' ')
})
</script>

<template>
  <div class="pk-chart">
    <dl class="pk-chart__stats">
      <div>
        <dt class="pc-faint">Now</dt>
        <dd class="pc-num">{{ fmt(summary.now) }}</dd>
      </div>
      <div v-if="summary.peak">
        <dt class="pc-faint">{{ preview ? 'Peak with this dose' : 'Peak' }}</dt>
        <dd class="pc-num">
          {{ fmt(summary.peak.amount) }}
          <span class="pc-faint">· {{ formatShort(summary.peak.at) }}</span>
        </dd>
      </div>
      <div v-if="summary.clearsAt">
        <dt class="pc-faint">Below 10% of peak</dt>
        <dd class="pc-num">{{ formatShort(summary.clearsAt) }}</dd>
      </div>
    </dl>
    <v-chart
      class="pk-chart__canvas"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaSummary"
    />
  </div>
</template>

<style scoped>
.pk-chart__canvas {
  width: 100%;
  height: 280px;
}

@media (min-width: 840px) {
  .pk-chart__canvas {
    height: 340px;
  }
}

.pk-chart__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0 0 8px;
}

.pk-chart__stats dt {
  font-size: 0.75rem;
  font-weight: 600;
}

.pk-chart__stats dd {
  margin: 0;
  font-weight: 600;
}
</style>
