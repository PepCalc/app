<script setup lang="ts">
import { computed, ref } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { overlayModel, overlayTable, type OverlayInput } from '@/domain/overlay'
import { roundTo } from '@/domain/units'
import { useChartColors } from '@/composables/useChartColors'
import { formatShort } from '@/services/time'
import { overlayOption } from './overlayChart'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

/**
 * Up to four peptides' estimated levels on one time axis, each scaled to its own peak, with a
 * table view. Colour slots come from the caller so a curve keeps its colour as others come and go.
 */
const props = defineProps<{
  inputs: OverlayInput[]
  slots: ReadonlyMap<string, number>
  now: number
}>()

const { colors } = useChartColors()
const showTable = ref(false)

const model = computed(() => overlayModel(props.inputs, props.now))
const option = computed(() =>
  overlayOption(model.value.window, model.value.series, props.slots, props.now, colors.value),
)
const rows = computed(() => overlayTable(props.inputs, model.value.series, model.value.window))

const ariaSummary = computed(() => {
  const parts = model.value.series.map((s) => {
    const nowPoint = s.points.reduce((best, p) =>
      Math.abs(p.at - props.now) < Math.abs(best.at - props.now) ? p : best,
    )
    return `${s.label} ${roundTo(nowPoint.percent, 0)}% of its peak now`
  })
  return `Estimated levels, each scaled to its own peak: ${parts.join('; ')}.`
})
</script>

<template>
  <div class="overlay-chart">
    <v-chart
      class="overlay-chart__canvas"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaSummary"
    />
    <p class="text-body-small pc-muted">
      Estimated levels, each scaled to its own peak to compare timing. Tap a line for its amount.
    </p>
    <v-btn variant="text" size="small" @click="showTable = !showTable">
      {{ showTable ? 'Hide table' : 'Show as table' }}
    </v-btn>
    <v-expand-transition>
      <v-table v-if="showTable" density="compact" class="overlay-chart__table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th v-for="s in model.series" :key="s.key" scope="col" class="text-end">
              {{ s.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.at">
            <td>{{ formatShort(row.at) }}</td>
            <td v-for="(p, i) in row.percents" :key="i" class="text-end pc-num">
              {{ roundTo(p, 0) }}%
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-expand-transition>
  </div>
</template>

<style scoped>
.overlay-chart__canvas {
  width: 100%;
  height: 320px;
}

@media (min-width: 840px) {
  .overlay-chart__canvas {
    height: 380px;
  }
}

.overlay-chart__table {
  background: transparent;
}
</style>
