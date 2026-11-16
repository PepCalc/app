import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components'
import type { ChartColors } from '@/composables/useChartColors'
import { type DoseBands, shotsNear } from '@/domain/doseBands'
import { niceRange } from '@/domain/report'
import { formatAmount, roundTo } from '@/domain/units'
import { PIN } from './photoPins'

interface BodyPoint {
  at: number
  value: number
  /** Shown beside the value in the table, such as when in the day a glucose was taken. */
  note?: string
}

export interface BodyChartInput {
  points: BodyPoint[]
  /**
   * A second set of readings. Unjoined hollow points by default (glucose at other times of
   * day); `joined` draws a dashed line with hollow points instead (diastolic blood pressure).
   */
  secondary?: { name: string; points: BodyPoint[]; joined?: boolean }
  unitLabel: string
  /** "Weight", "BMI", "HbA1c": names the line and the table column. */
  measure: string
  decimals: number
  /** Horizontal guides such as a goal weight or BMI band edges; drawn dashed with a label. */
  guides: { value: number; label: string }[]
  /** Progress photos pinned to the line: `symbol` is the pin image, `value` the line's height. */
  photos?: { id: string; at: number; value: number; symbol: string }[]
  /** Doses on the line (see `domain/doseBands.ts`). */
  doses?: DoseBands
  /** The dates in view. Null shows every point. The chart owns zoom through this. */
  window?: { start: number; end: number } | null
}

/** Names the pinned-photo series, so a click on a pin can be told apart. */
export const PHOTO_SERIES = 'Photos'

/** Names the dose-callout scatter series. */
const DOSE_SERIES = 'Doses'

/** A readout counts doses within half a day of the weigh-in as on that day. */
const SAME_DAY_MS = 12 * 3_600_000

/** Height above the plot reserved for dose callout pills (px). */
const PILL_ROOM = 22

export type BodyChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | VisualMapComponentOption
>

/**
 * The ECharts option for a body measure over time, shared by the in-app chart and the share
 * image. `hideValues` drops the value axis labels, for an image that shows the shape only;
 * `pinRoom` leaves space above the plot for photo pins drawn over it; `labelled` chooses which
 * shot indices carry a pill (defaulting to change shots for static share images).
 */
export function bodyChartOption(
  props: BodyChartInput,
  c: ChartColors,
  options: { hideValues?: boolean; pinRoom?: boolean; labelled?: ReadonlySet<number> } = {},
): BodyChartOption {
  const fmt = (v: number) => `${roundTo(v, props.decimals)} ${props.unitLabel}`.trim()
  const extra = props.secondary?.points ?? []
  const joined = !!props.secondary?.joined
  const values = [...props.points, ...extra].map((p) => p.value)
  const all = [...values, ...props.guides.map((g) => g.value)]
  const min = Math.min(...all)
  const max = Math.max(...all)
  // Round ticks with a little room either side, so the first and last labels never collide.
  const pad = Math.max((max - min) * 0.1, 0.5)
  const ticks = niceRange(min - pad, max + pad, 5)
  const hasPhotos = !!(props.photos?.length || options.pinRoom)
  const hasShots = !!props.doses?.shots.length
  const headRoom = Math.max(hasPhotos ? PIN.height : 0, hasShots ? PILL_ROOM : 0)
  const bands = props.doses?.bands ?? []

  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.text },
    grid: {
      left: 8,
      right: 16,
      top: (extra.length ? 36 : 16) + headRoom,
      bottom: 8,
      containLabel: true,
    },
    legend: extra.length
      ? {
          top: 0,
          left: 0,
          itemGap: 20,
          // Wide enough to show a joined second line's dashes.
          itemWidth: joined ? 28 : 14,
          itemHeight: 10,
          textStyle: { color: c.axis, fontFamily: c.font, fontSize: 11 },
          data: [props.measure, props.secondary!.name],
        }
      : undefined,
    // Unjoined points have no axis position to snap to, so a chart with them reads per point.
    tooltip: {
      trigger: extra.length && !joined ? 'item' : 'axis',
      backgroundColor: c.surface,
      borderColor: c.grid,
      textStyle: { color: c.text, fontFamily: c.font },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const lines = list
          .filter((p) => p.seriesName !== PHOTO_SERIES && p.seriesName !== DOSE_SERIES)
          .map((p) => `${p.marker}${p.seriesName}: ${fmt((p.value as [number, number])[1])}`)
        if (!props.doses?.shots.length) return lines.join('<br>')
        const at = Number((list[0]?.value as [number, number] | undefined)?.[0])
        if (!Number.isFinite(at)) return lines.join('<br>')
        const near = shotsNear(props.doses.shots, at, SAME_DAY_MS).map(
          (s) => `${s.label} ${formatAmount(s.amount, s.unitLabel)} dose`,
        )
        return [...lines, ...near].join('<br>')
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.grid } },
      axisLabel: {
        color: c.axis,
        hideOverlap: true,
        formatter: { month: '{MMM}', day: '{MMM} {d}', year: '{yyyy}' },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: ticks[0],
      max: ticks[ticks.length - 1],
      interval: ticks[1]! - ticks[0]!,
      axisLabel: {
        show: !options.hideValues,
        color: c.axis,
        formatter: (v: number) => `${roundTo(v, 2)}${props.unitLabel === '%' ? '%' : ''}`,
      },
      splitLine: { lineStyle: { color: c.grid } },
    },
    dataZoom: [
      {
        type: 'inside',
        filterMode: 'none',
        ...(props.window
          ? { startValue: props.window.start, endValue: props.window.end }
          : { start: 0, end: 100 }),
      },
    ],
    ...(bands.length
      ? {
          visualMap: {
            show: false,
            type: 'piecewise' as const,
            seriesIndex: 0,
            dimension: 0,
            // The final band is inclusive at its upper edge so the last point keeps the band colour
            // instead of falling into outOfRange.
            pieces: bands.map((b, i) => ({
              gte: b.start,
              ...(i === bands.length - 1 ? { lte: b.end } : { lt: b.end }),
              color: c.doses[b.slot] ?? c.logged,
            })),
            outOfRange: { color: c.logged },
          },
        }
      : {}),
    series: [
      {
        name: props.measure,
        type: 'line',
        showSymbol: props.points.length < 40,
        symbolSize: 6,
        lineStyle: { width: 2, color: c.logged, cap: 'round', join: 'round' },
        itemStyle: { color: c.logged },
        data: props.points.map((p) => [p.at, p.value]),
        markLine: props.guides.length
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: c.now, type: 'dashed', width: 1 },
              label: {
                color: c.axis,
                fontFamily: c.font,
                formatter: '{b}',
                position: 'insideEndTop',
              },
              data: props.guides.map((g) => ({ yAxis: g.value, name: g.label })),
            }
          : undefined,
      },
      ...(extra.length && joined
        ? [
            {
              name: props.secondary!.name,
              type: 'line' as const,
              symbol: 'emptyCircle',
              showSymbol: extra.length < 40,
              symbolSize: 6,
              lineStyle: {
                width: 2,
                color: c.preview,
                type: 'dashed' as const,
                cap: 'round' as const,
              },
              itemStyle: { color: c.preview, borderWidth: 2 },
              data: extra.map((p) => [p.at, p.value]),
            },
          ]
        : extra.length
          ? [
              {
                name: props.secondary!.name,
                type: 'scatter' as const,
                symbol: 'emptyCircle',
                symbolSize: 8,
                itemStyle: { color: c.preview, borderWidth: 2 },
                data: extra.map((p) => [p.at, p.value]),
              },
            ]
          : []),
      ...(hasShots ? [doseSeries(props.doses!, props.points, c, options.labelled)] : []),
      // The pin's tip, at the bottom centre of its image, sits on the line.
      ...(props.photos?.length
        ? [
            {
              name: PHOTO_SERIES,
              type: 'scatter' as const,
              z: 10,
              cursor: 'pointer',
              tooltip: { show: false },
              symbolSize: [PIN.width, PIN.height],
              symbolOffset: [0, '-50%'],
              data: props.photos.map((p) => ({
                value: [p.at, p.value],
                symbol: `image://${p.symbol}`,
                id: p.id,
              })),
            },
          ]
        : []),
    ],
  }
}

interface DoseDatum {
  value: [number, number]
  text: string
  itemStyle: { color: string }
  label: {
    show: boolean
    backgroundColor: string
    align?: 'left' | 'center' | 'right'
    offset?: [number, number]
  }
}

function doseSeries(
  doses: DoseBands,
  points: readonly BodyPoint[],
  c: ChartColors,
  labelled?: ReadonlySet<number>,
): ScatterSeriesOption {
  const minAt = points[0]?.at ?? 0
  const maxAt = points[points.length - 1]?.at ?? minAt
  const span = maxAt - minAt
  return {
    name: DOSE_SERIES,
    type: 'scatter',
    z: 5,
    tooltip: { show: false },
    symbol: 'circle',
    symbolSize: 7,
    itemStyle: { borderColor: c.surface, borderWidth: 1 },
    label: {
      position: 'top',
      distance: 6,
      color: c.onDose,
      borderRadius: 9,
      padding: [2, 7],
      fontFamily: c.font,
      fontSize: 11,
      formatter: (p) => (p.data as DoseDatum).text,
    },
    labelLayout: { hideOverlap: true },
    data: doses.shots.map((s, index) => {
      const color = c.doses[s.slot] ?? c.logged
      const amount = formatAmount(s.amount, s.unitLabel)
      // Keep pills near the plot edges inside the plot so they never overlap the y-axis ticks.
      const frac = span > 0 ? (s.at - minAt) / span : 0
      const edge: Pick<DoseDatum['label'], 'align' | 'offset'> =
        frac < 0.12
          ? { align: 'left', offset: [-4, 0] }
          : frac > 0.85
            ? { align: 'right', offset: [4, 0] }
            : {}
      return {
        value: [s.at, s.value] as [number, number],
        text: doses.named && s.first ? `${s.label} ${amount}` : amount,
        itemStyle: { color },
        label: {
          show: labelled ? labelled.has(index) : s.changed,
          backgroundColor: color,
          ...edge,
        },
      }
    }),
  }
}
