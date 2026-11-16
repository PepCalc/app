<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useChartColors } from '@/composables/useChartColors'
import { formatDate, formatDateRange } from '@/services/time'
import { labelledShots } from '@/domain/doseBands'
import { formatAmount, roundTo } from '@/domain/units'
import { bodyChartOption, PHOTO_SERIES, type BodyChartInput } from './bodyChart'

use([
  LineChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
  VisualMapPiecewiseComponent,
  CanvasRenderer,
])

/**
 * One measure over time (weight, BMI, HbA1c, glucose, blood pressure or heart rate) with
 * optional labelled reference lines. A secondary set is drawn as unjoined hollow points (glucose
 * at other times of day, never joined into one line with fasting readings) or as a dashed line
 * (diastolic beside systolic blood pressure). On weight and BMI, doses colour the line by
 * strength and mark shots with pills.
 */
const props = defineProps<BodyChartInput>()
const window = defineModel<{ start: number; end: number } | null>('window', { default: null })
const emit = defineEmits<{ photo: [id: string] }>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
let zoomFrame: number | null = null

watch(
  () => props.measure,
  () => {
    window.value = null
  },
)

function onDataZoom() {
  if (zoomFrame !== null) return
  zoomFrame = requestAnimationFrame(() => {
    zoomFrame = null
    const opt = chartRef.value?.getOption() as
      { dataZoom?: { startValue?: unknown; endValue?: unknown }[] } | undefined
    const dz = opt?.dataZoom?.[0]
    if (typeof dz?.startValue === 'number' && typeof dz?.endValue === 'number') {
      window.value = { start: dz.startValue, end: dz.endValue }
    }
  })
}

onBeforeUnmount(() => {
  if (zoomFrame !== null) cancelAnimationFrame(zoomFrame)
})

function onClick(event: { seriesName?: string; data?: unknown }) {
  const id = (event.data as { id?: unknown } | undefined)?.id
  if (event.seriesName === PHOTO_SERIES && typeof id === 'string') emit('photo', id)
}

const { colors } = useChartColors()

const fmt = (v: number) => `${roundTo(v, props.decimals)} ${props.unitLabel}`.trim()

const labelled = computed(() => {
  if (!props.doses?.shots.length) return undefined
  return labelledShots(props.doses.shots, window.value ?? { start: -Infinity, end: Infinity })
})

const option = computed(() =>
  bodyChartOption(
    { ...props, window: window.value },
    colors.value,
    labelled.value ? { labelled: labelled.value } : {},
  ),
)

const ariaSummary = computed(() => {
  const pts = props.points
  if (!pts.length) return `${props.measure}: no entries yet.`
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const second = props.secondary?.joined ? props.secondary.points : []
  const secondary = second.length
    ? ` ${props.secondary!.name} from ${fmt(second[0]!.value)} to ${fmt(second[second.length - 1]!.value)}.`
    : ''
  const photos = props.photos?.length
    ? ` ${props.photos.length} progress photo${props.photos.length === 1 ? '' : 's'} pinned to the line.`
    : ''
  const changed = props.doses?.shots.filter((s) => s.changed) ?? []
  const doses = changed.length
    ? ` Doses by date: ${changed
        .map(
          (s) =>
            `${formatDate(s.at)} ${s.first ? `${s.label} ` : ''}${formatAmount(s.amount, s.unitLabel)}`,
        )
        .join(', ')}.`
    : ''
  return `${props.measure} from ${fmt(first.value)} to ${fmt(last.value)}, ${formatDateRange(first.at, last.at)}, ${pts.length} entries.${secondary}${photos}${doses}`
})
</script>

<template>
  <div>
    <v-chart
      ref="chartRef"
      class="body-chart"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaSummary"
      @click="onClick"
      @datazoom="onDataZoom"
    />
  </div>
</template>

<style scoped>
.body-chart {
  width: 100%;
  height: 260px;
}

@media (min-width: 840px) {
  .body-chart {
    height: 320px;
  }
}
</style>
