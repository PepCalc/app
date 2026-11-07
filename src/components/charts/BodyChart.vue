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
import { useChartColors } from '@/composables/useChartColors'
import { formatDateRange } from '@/services/time'
import { formatAmount, roundTo } from '@/domain/units'
import { bodyChartOption, panelHeight, PHOTO_SERIES, type BodyChartInput } from './bodyChart'

use([
  LineChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

/**
 * One measure over time (weight, BMI, HbA1c or glucose) with optional labelled reference lines.
 * A secondary set (glucose at other times of day) is drawn as unjoined hollow points, so
 * readings taken under different conditions are never joined into one line. Doses can show as
 * one row per peptide under it, and estimated levels in a strip at the bottom, on the same dates.
 */
const props = defineProps<BodyChartInput>()
const emit = defineEmits<{ photo: [id: string] }>()

function onClick(event: { seriesName?: string; data?: unknown }) {
  const id = (event.data as { id?: unknown } | undefined)?.id
  if (event.seriesName === PHOTO_SERIES && typeof id === 'string') emit('photo', id)
}

const { colors } = useChartColors()

const fmt = (v: number) => `${roundTo(v, props.decimals)} ${props.unitLabel}`.trim()

const option = computed(() => bodyChartOption(props, colors.value))
// The rows and strip add their own height, so the measure keeps its size.
const extraHeight = computed(() => `${panelHeight(props)}px`)

const amount = (value: number, unit: string) => formatAmount(value, unit)

const ariaSummary = computed(() => {
  const pts = props.points
  if (!pts.length) return `${props.measure}: no entries yet.`
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const photos = props.photos?.length
    ? ` ${props.photos.length} progress photo${props.photos.length === 1 ? '' : 's'} pinned to the line.`
    : ''
  const lanes = (props.lanes ?? [])
    .map((l) => {
      const strengths = l.marks.filter((m) => m.changed).map((m) => amount(m.amount, l.unitLabel))
      return `${l.label}, ${l.marks.length} dose${l.marks.length === 1 ? '' : 's'} (${strengths.join(' then ')})`
    })
    .join('; ')
  const doses = lanes ? ` Doses below: ${lanes}.` : ''
  const levels = props.levels
    ? ` Estimated levels at the latest entry: ${props.levels
        .readAt(last.at)
        .map((r) =>
          props.levels!.scale === 'amount'
            ? `${r.label} ${amount(r.amount, r.unitLabel)}`
            : `${r.label} ${roundTo(r.percent, 0)}% of peak`,
        )
        .join(', ')}.`
    : ''
  return `${props.measure} from ${fmt(first.value)} to ${fmt(last.value)}, ${formatDateRange(first.at, last.at)}, ${pts.length} entries.${photos}${doses}${levels}`
})
</script>

<template>
  <div>
    <v-chart
      class="body-chart"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaSummary"
      @click="onClick"
    />
  </div>
</template>

<style scoped>
.body-chart {
  width: 100%;
  height: calc(260px + v-bind(extraHeight));
}

@media (min-width: 840px) {
  .body-chart {
    height: calc(320px + v-bind(extraHeight));
  }
}
</style>
