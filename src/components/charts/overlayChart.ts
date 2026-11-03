import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { OverlaySeries } from '@/domain/overlay'
import type { SimulationWindow } from '@/domain/pk'
import { formatAmount, roundTo } from '@/domain/units'
import type { ChartColors } from '@/composables/useChartColors'

export type OverlayChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
>

/**
 * A dash pattern per slot, so a line is told apart by its pattern as well as its colour (for
 * colour-blind readers, greyscale prints, and the low-contrast orange).
 */
const SLOT_DASHES: ('solid' | number[])[] = ['solid', [10, 5], [2, 4], [10, 4, 2, 4]]

/**
 * The ECharts option for several peptides on one chart, each scaled to its own peak (see
 * `domain/overlay.ts`). The tooltip gives each line's percent and its estimated amount in its
 * own unit, so no amount is ever read off the shared axis.
 */
export function overlayOption(
  window: SimulationWindow,
  series: readonly OverlaySeries[],
  slots: ReadonlyMap<string, number>,
  now: number,
  c: ChartColors,
): OverlayChartOption {
  const amountsByName = new Map(
    series.map((s) => [
      s.label,
      { unit: s.unitLabel, byAt: new Map(s.points.map((p) => [p.at, p.amount])) },
    ]),
  )
  const lines: LineSeriesOption[] = series.map((s, i) => {
    const slot = slots.get(s.key) ?? 0
    const color = c.series[slot] ?? c.logged
    return {
      name: s.label,
      type: 'line',
      // No symbol, so the legend draws each line in its own dash pattern.
      symbol: 'none',
      lineStyle: { width: 2, color, type: SLOT_DASHES[slot], cap: 'round', join: 'round' },
      itemStyle: { color },
      data: s.points.map((p) => [p.at, p.percent]),
      markLine:
        i === 0
          ? {
              silent: true,
              symbol: 'none',
              label: { formatter: 'Now', color: c.axis, fontFamily: c.font },
              lineStyle: { color: c.now, type: 'solid', width: 1 },
              data: [{ xAxis: now }],
            }
          : undefined,
    }
  })

  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.text },
    grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: c.text, fontFamily: c.font },
      itemWidth: 28,
      itemHeight: 10,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: c.axis } },
      backgroundColor: c.surface,
      borderColor: c.grid,
      textStyle: { color: c.text, fontFamily: c.font },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        return list
          .map((p) => {
            const [at, percent] = p.value as [number, number]
            const amounts = amountsByName.get(p.seriesName ?? '')
            const amount = amounts?.byAt.get(at)
            const detail = amount === undefined ? '' : ` · ${formatAmount(amount, amounts!.unit)}`
            return `${p.marker}${p.seriesName}: ${roundTo(percent, 0)}% of peak${detail}`
          })
          .join('<br>')
      },
    },
    xAxis: {
      type: 'time',
      min: window.start,
      max: window.end,
      axisLine: { lineStyle: { color: c.grid } },
      axisLabel: {
        color: c.axis,
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
      max: 100,
      interval: 25,
      axisLabel: { color: c.axis, formatter: '{value}%' },
      splitLine: { lineStyle: { color: c.grid, type: 'solid', width: 1 } },
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: lines,
  }
}
