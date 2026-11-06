import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { LevelsInput, LevelsModel } from '@/domain/levels'
import { formatAmount, roundTo } from '@/domain/units'
import type { ChartColors } from '@/composables/useChartColors'

export type LevelsChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
>

const LOGGED_SERIES = 'Logged doses'
const PREVIEW_SERIES = 'With this dose'

export interface LevelsOptionSettings {
  /** Static rendering for an image: no tooltip or zoom, larger type. */
  forImage?: boolean
  /** Leave amounts off the value axis, for sharing the shape of the curve only. */
  hideAmounts?: boolean
  /** Legend name of the dashed series. */
  previewName?: string
  /** Marks the moment levels reach steady state. */
  steadyAt?: number | null
  /** Leaves the dose markers off a schedule too dense to read them. */
  hideDoses?: boolean
}

/**
 * The ECharts option for a levels chart: logged doses solid with a light fill, the previewed
 * draw dashed (identity never rests on colour alone), dose markers on the baseline and a "Now"
 * line. Colours come from the theme tokens via `colors`.
 */
export function levelsOption(
  input: LevelsInput,
  model: LevelsModel,
  c: ChartColors,
  settings: LevelsOptionSettings = {},
): LevelsChartOption {
  const { unitLabel, now } = input
  const { window, logged, projected, allDoses } = model
  const hasHistory = input.doses.length > 0
  const hasPreview = projected.length > 0
  const previewName = settings.previewName ?? PREVIEW_SERIES
  const scale = settings.forImage ? 1.6 : 1
  const fontSize = 12 * scale
  const nowLine = {
    silent: true,
    symbol: 'none',
    label: { formatter: 'Now', color: c.axis, fontFamily: c.font, fontSize },
    lineStyle: { color: c.now, type: 'solid' as const, width: 1 * scale },
    data: [{ xAxis: now }],
  }
  const steadyMark = settings.steadyAt
    ? {
        xAxis: settings.steadyAt,
        label: { formatter: 'Steady' },
        lineStyle: { type: 'dashed' as const },
      }
    : null
  const previewMarks = [...(hasHistory ? [] : nowLine.data), ...(steadyMark ? [steadyMark] : [])]

  const series: (LineSeriesOption | ScatterSeriesOption)[] = []
  if (hasHistory) {
    series.push({
      name: LOGGED_SERIES,
      type: 'line',
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 * scale, color: c.logged, cap: 'round', join: 'round' },
      itemStyle: { color: c.logged },
      areaStyle: { color: c.logged, opacity: 0.1 },
      data: logged.map((p) => [p.at, p.amount]),
      markLine: nowLine,
    })
  }
  if (hasPreview) {
    series.push({
      name: previewName,
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2 * scale, color: c.preview, type: 'dashed' },
      itemStyle: { color: c.preview },
      areaStyle: hasHistory ? undefined : { color: c.preview, opacity: 0.1 },
      data: projected.map((p) => [p.at, p.amount]),
      markLine: previewMarks.length ? { ...nowLine, data: previewMarks } : undefined,
    })
  }
  if (!settings.hideDoses) {
    series.push({
      name: 'Doses',
      type: 'scatter',
      symbol: 'triangle',
      symbolSize: 10 * scale,
      itemStyle: { color: c.axis, borderColor: c.surface, borderWidth: 2 },
      tooltip: { show: false },
      data: allDoses
        .filter((d) => d.at >= window.start && d.at <= window.end)
        .map((d) => [d.at, 0]),
      z: 3,
    })
  }

  const legend = hasHistory && hasPreview
  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.text, fontSize },
    grid: {
      left: 8,
      right: 16 * scale,
      top: legend ? 40 * scale : 16,
      bottom: 8,
      containLabel: true,
    },
    legend: legend
      ? {
          data: [LOGGED_SERIES, previewName],
          top: 0,
          left: 0,
          textStyle: { color: c.text, fontFamily: c.font, fontSize },
          itemWidth: 18 * scale,
          itemHeight: 8 * scale,
        }
      : undefined,
    tooltip: settings.forImage
      ? undefined
      : {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: c.axis } },
          backgroundColor: c.surface,
          borderColor: c.grid,
          textStyle: { color: c.text, fontFamily: c.font },
          valueFormatter: (v) => formatAmount(Number(v), unitLabel),
        },
    xAxis: {
      type: 'time',
      min: window.start,
      max: window.end,
      axisLine: { lineStyle: { color: c.grid } },
      axisLabel: {
        color: c.axis,
        fontSize,
        hideOverlap: true,
        formatter: {
          year: '{yyyy}',
          month: '{MMM} {d}',
          day: '{MMM} {d}',
          hour: '{HH}:{mm}',
          minute: '{HH}:{mm}',
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        show: !settings.hideAmounts,
        color: c.axis,
        fontSize,
        formatter: (v: number): string => `${roundTo(v, 3)} ${unitLabel}`,
      },
      splitLine: { lineStyle: { color: c.grid, type: 'solid', width: 1 } },
    },
    dataZoom: settings.forImage ? undefined : [{ type: 'inside', filterMode: 'none' }],
    series,
  }
}
