<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { formatDate, formatDateRange } from '@/services/time'
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
const showTable = ref(false)

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

interface TableRow {
  at: number
  value?: number
  note?: string
  doses?: string
}

/**
 * Every reading, and one row for each day with doses, newest first. A day's doses share a row so
 * a peptide taken daily does not add a row per peptide per day. Each row carries the estimated
 * levels at that moment when the strip is shown.
 */
const rows = computed(() => {
  const days = new Map<string, { at: number; parts: string[] }>()
  for (const lane of props.lanes ?? []) {
    for (const m of lane.marks) {
      const day = formatDate(m.at)
      const entry = days.get(day) ?? { at: m.at, parts: [] }
      entry.at = Math.max(entry.at, m.at)
      entry.parts.push(`${lane.label} ${amount(m.amount, lane.unitLabel)}`)
      days.set(day, entry)
    }
  }
  return [
    ...[...props.points, ...(props.secondary?.points ?? [])].map<TableRow>((p) => p),
    ...[...days.values()].map<TableRow>((d) => ({ at: d.at, doses: d.parts.join(', ') })),
  ]
    .sort((a, b) => b.at - a.at)
    .map((row) => ({ ...row, levels: props.levels?.readAt(row.at) ?? [] }))
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
    <v-btn variant="text" size="small" class="mt-1" @click="showTable = !showTable">
      {{ showTable ? 'Hide table' : 'Show as table' }}
    </v-btn>
    <v-expand-transition>
      <v-table v-if="showTable" density="compact" class="body-chart__table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" class="text-end">{{ measure }}</th>
            <th v-if="lanes?.length" scope="col">Doses</th>
            <th v-for="s in levels?.series ?? []" :key="s.key" scope="col" class="text-end">
              {{ s.label }} level
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="`${row.at}-${i}`">
            <td>{{ formatDate(row.at) }}</td>
            <td class="text-end pc-num">
              <template v-if="row.value !== undefined">{{ fmt(row.value) }}</template>
              <span v-if="row.note" class="d-block text-body-small pc-faint">{{ row.note }}</span>
            </td>
            <td v-if="lanes?.length">{{ row.doses }}</td>
            <td v-for="r in row.levels" :key="r.key" class="text-end pc-num">
              {{
                levels?.scale === 'amount'
                  ? amount(r.amount, r.unitLabel)
                  : `${roundTo(r.percent, 0)}%`
              }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-expand-transition>
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

.body-chart__table {
  background: transparent;
}
</style>
