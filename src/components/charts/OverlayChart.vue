<script setup lang="ts">
import { computed } from 'vue'
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
import { overlayModel, type OverlayInput } from '@/domain/overlay'
import { roundTo } from '@/domain/units'
import { useChartColors } from '@/composables/useChartColors'
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
 * Up to four peptides' estimated levels on one time axis, each scaled to its own peak. Colour
 * slots come from the caller so a curve keeps its colour as others come and go.
 */
const props = defineProps<{
  inputs: OverlayInput[]
  slots: ReadonlyMap<string, number>
  now: number
}>()

const { colors } = useChartColors()

const model = computed(() => overlayModel(props.inputs, props.now))
const option = computed(() =>
  overlayOption(model.value.window, model.value.series, props.slots, props.now, colors.value),
)

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
</style>
