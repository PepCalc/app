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
import { projectLevels } from '@/domain/projection'
import { formatAmount, roundTo } from '@/domain/units'
import { useChartColors } from '@/composables/useChartColors'
import { levelsOption } from './levelsChart'
import { outlookStat } from './projectionText'

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

/** Above this many markers the baseline is a solid comb that says nothing. */
const MAX_DOSE_MARKS = 60

const props = defineProps<{
  params: PkParameters
  doseTimes: number[]
  /** The dose the schedule repeats; null shows percent of the steady peak. */
  amount: number | null
  /** Logged doses, oldest first, in `unitLabel`. */
  history: DoseEvent[]
  unitLabel: string
  now: number
}>()

const { colors } = useChartColors()

const model = computed(() => projectLevels(props))
const unit = computed(() => (model.value.relative ? '%' : props.unitLabel))
const fmt = (v: number) =>
  model.value.relative ? `${Math.round(v)}%` : formatAmount(v, props.unitLabel)

const outlook = computed(() => outlookStat(model.value.outlook, props.now))
const settled = computed(() => model.value.outlook.kind !== 'cut-off')

const option = computed(() =>
  levelsOption(
    {
      params: props.params,
      doses: props.history,
      preview: null,
      unitLabel: unit.value,
      now: props.now,
    },
    model.value,
    colors.value,
    {
      previewName: 'Projected',
      steadyAt: model.value.outlook.kind === 'by' ? model.value.outlook.at : null,
      hideDoses: model.value.allDoses.length > MAX_DOSE_MARKS,
    },
  ),
)

const ariaSummary = computed(() => {
  const { value, label, detail } = outlook.value
  const parts = [`Projected levels. ${label}: ${value}${detail ? `, ${detail}` : ''}.`]
  if (settled.value) {
    const { peak, trough } = model.value.plateau
    parts.push(`Peak ${fmt(peak)}. Before each dose ${fmt(trough)}.`)
  }
  return parts.join(' ')
})
</script>

<template>
  <div class="projection-chart">
    <dl class="projection-chart__stats">
      <div>
        <dt class="pc-faint">{{ outlook.label }}</dt>
        <dd class="pc-num">
          {{ outlook.value }}
          <span v-if="outlook.detail" class="pc-faint">· {{ outlook.detail }}</span>
        </dd>
      </div>
      <div v-if="settled && model.relative">
        <dt class="pc-faint">Builds to</dt>
        <dd class="pc-num">{{ roundTo(model.buildUp, 1) }}× one dose</dd>
      </div>
      <div v-else-if="settled">
        <dt class="pc-faint">Peak</dt>
        <dd class="pc-num">{{ fmt(model.plateau.peak) }}</dd>
      </div>
      <div v-if="settled">
        <dt class="pc-faint">Before each dose</dt>
        <dd class="pc-num">{{ fmt(model.plateau.trough) }}</dd>
      </div>
    </dl>
    <v-chart
      class="projection-chart__canvas"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaSummary"
    />
  </div>
</template>

<style scoped>
.projection-chart__canvas {
  width: 100%;
  height: 248px;
}

.projection-chart__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0 0 8px;
}

.projection-chart__stats dt {
  font-size: 0.75rem;
  font-weight: 600;
}

.projection-chart__stats dd {
  margin: 0;
  font-weight: 600;
}
</style>
