import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ChartColors } from '@/composables/useChartColors'
import { PIN } from './photoPins'
import { niceRange } from '@/domain/report'
import { formatAmount, roundTo } from '@/domain/units'
import {
  amountTicks,
  levelStrip,
  stripReadings,
  stripWindow,
  type StripInput,
  type StripReading,
  type StripScale,
  type StripSeries,
} from '@/domain/levelStrip'
import { doseLanes, lanesAt, type DoseLane, type LaneInput } from '@/domain/doseLanes'

interface BodyPoint {
  at: number
  value: number
  /** Shown beside the value in the table, such as when in the day a glucose was taken. */
  note?: string
}

export interface BodyChartInput {
  points: BodyPoint[]
  /** Readings drawn as unjoined hollow points (glucose at other times of day). */
  secondary?: { name: string; points: BodyPoint[] }
  unitLabel: string
  /** "Weight", "BMI", "HbA1c": names the line and the table column. */
  measure: string
  decimals: number
  /** Horizontal guides such as a goal weight or BMI band edges; drawn dashed with a label. */
  guides: { value: number; label: string }[]
  /** Progress photos pinned to the line: `symbol` is the pin image, `value` the line's height. */
  photos?: { id: string; at: number; value: number; symbol: string }[]
  /** Logged doses, one row per peptide, under the measure (see `domain/doseLanes.ts`). */
  lanes?: (DoseLane & { slot: number })[]
  /** Estimated levels in a strip at the bottom (see `domain/levelStrip.ts`). */
  levels?: LevelStripInput
  /** The dates the rows and strip span; the measure's axis follows it when either is shown. */
  window?: { start: number; end: number }
}

interface LevelStripInput {
  /** Each line with its colour slot, which stays with the peptide. */
  series: (StripSeries & { slot: number })[]
  /** Every line's exact level at a moment, for the readout. */
  readAt: (at: number) => StripReading[]
  /** Whether the axis reads in the peptide's unit or percent of each line's own peak. */
  scale: StripScale
}

/** A peptide in the rows and strip: its doses, and its curve when one can be drawn. */
export interface PanelPeptide extends LaneInput {
  slot: number
  /** Null for a peptide without human PK data: it gets a row but no level line. */
  strip: StripInput | null
  /** The curve uses the user's own half-life rather than published values. */
  userSupplied: boolean
}

/**
 * The rows and the strip for a chart whose entries fall at `times`: one window for both, from
 * the first entry to now, so they share the measure's dates. The strip reads in the peptide's
 * unit only when `scale` says so (see `stripScale`).
 */
export function panelInput(
  peptides: readonly PanelPeptide[],
  times: readonly number[],
  now: number,
  show: { lanes: boolean; levels: boolean; scale: StripScale },
): Pick<BodyChartInput, 'lanes' | 'levels' | 'window'> {
  const window = stripWindow(times, now)
  const slotOf = new Map(peptides.map((p) => [p.key, p.slot]))
  const lanes = show.lanes
    ? doseLanes(peptides, window).map((l) => ({ ...l, slot: slotOf.get(l.key) ?? 0 }))
    : []
  const inputs = show.levels ? peptides.flatMap((p) => (p.strip ? [p.strip] : [])) : []
  const series = levelStrip(inputs, window)
  return {
    window,
    lanes: lanes.length ? lanes : undefined,
    levels: inputs.length
      ? {
          series: series.map((x) => ({ ...x, slot: slotOf.get(x.key) ?? 0 })),
          readAt: (at) => stripReadings(inputs, series, at),
          scale: show.scale,
        }
      : undefined,
  }
}

/** A dash per slot, so a level line is told apart by pattern as well as colour. */
const LEVEL_DASHES: ('solid' | number[])[] = ['solid', [10, 5], [2, 4], [8, 3, 2, 3]]

/** Each dose row's height, and the gaps that keep the panels apart (px). */
const LANE_ROW = 28
const PANEL_GAP = 12
const STRIP_PLOT = 72
const STRIP_LEGEND = 20
const X_LABELS = 24
/** Smaller panels for a share image, whose chart has a fixed height to share with the measure. */
const COMPACT = { laneRow: 22, stripPlot: 52 }
/** One left edge for every panel, so a date sits at the same x in each. */
const PANEL_LEFT = 52

/**
 * The extra height the rows and strip need, so the chart grows by it instead of squeezing the
 * measure.
 */
export function panelHeight(props: Pick<BodyChartInput, 'lanes' | 'levels'>): number {
  const lanes = props.lanes?.length ? props.lanes.length * LANE_ROW + PANEL_GAP : 0
  const strip = props.levels ? STRIP_PLOT + STRIP_LEGEND + PANEL_GAP : 0
  return lanes + strip
}

/** Names the pinned-photo series, so a click on a pin can be told apart. */
export const PHOTO_SERIES = 'Photos'

export type BodyChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
>

/**
 * The ECharts option for a body measure over time, shared by the in-app chart and the share
 * image. `hideValues` drops the value axis labels, for an image that shows the shape only;
 * `pinRoom` leaves space above the plot for photo pins drawn over it; `compact` shrinks the dose
 * rows and level strip for a chart of fixed height.
 */
export function bodyChartOption(
  props: BodyChartInput,
  c: ChartColors,
  options: { hideValues?: boolean; pinRoom?: boolean; compact?: boolean } = {},
): BodyChartOption {
  const base = measureOption(props, c, options)
  return props.lanes?.length || props.levels
    ? withPanels(base, props, c, options.compact ?? false)
    : base
}

function measureOption(
  props: BodyChartInput,
  c: ChartColors,
  options: { hideValues?: boolean; pinRoom?: boolean },
): BodyChartOption {
  const fmt = (v: number) => `${roundTo(v, props.decimals)} ${props.unitLabel}`.trim()
  const extra = props.secondary?.points ?? []
  const values = [...props.points, ...extra].map((p) => p.value)
  const all = [...values, ...props.guides.map((g) => g.value)]
  const min = Math.min(...all)
  const max = Math.max(...all)
  // Round ticks with a little room either side, so the first and last labels never collide.
  const pad = Math.max((max - min) * 0.1, 0.5)
  const ticks = niceRange(min - pad, max + pad, 5)
  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.text },
    // Pins stand above their point, so the plot leaves room for the tallest one.
    grid: {
      left: 8,
      right: 16,
      top: (extra.length ? 36 : 16) + (props.photos?.length || options.pinRoom ? PIN.height : 0),
      bottom: 8,
      containLabel: true,
    },
    legend: extra.length
      ? {
          top: 0,
          left: 0,
          itemWidth: 14,
          itemHeight: 10,
          textStyle: { color: c.axis, fontFamily: c.font, fontSize: 11 },
          data: [props.measure, props.secondary!.name],
        }
      : undefined,
    // Unjoined points have no axis position to snap to, so a chart with them reads per point.
    tooltip: {
      trigger: extra.length ? 'item' : 'axis',
      backgroundColor: c.surface,
      borderColor: c.grid,
      textStyle: { color: c.text, fontFamily: c.font },
      valueFormatter: (v) => fmt(Number(v)),
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
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
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
      ...(extra.length
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

const amountText = (amount: number, unitLabel: string) => formatAmount(amount, unitLabel)

const levelText = (r: StripReading, scale: StripScale) =>
  scale === 'amount'
    ? `${r.label}: ${amountText(r.amount, r.unitLabel)}`
    : `${r.label}: ${roundTo(r.percent, 0)}% of peak`

/** A readout counts doses within half a day of the pointer as on that day. */
const SAME_DAY_MS = 12 * 3_600_000

/**
 * Adds the dose rows and the level strip under the measure, each in its own grid on one x-axis
 * window, one zoom and one crosshair. Every grid shares a fixed left edge rather than sizing to
 * its labels, so a date lines up across all three.
 */
function withPanels(
  base: BodyChartOption,
  props: BodyChartInput,
  c: ChartColors,
  compact: boolean,
): BodyChartOption {
  const laneRow = compact ? COMPACT.laneRow : LANE_ROW
  const stripPlot = compact ? COMPACT.stripPlot : STRIP_PLOT
  const lanes = props.lanes ?? []
  const levels = props.levels
  const fmt = (v: number) => `${roundTo(v, props.decimals)} ${props.unitLabel}`.trim()
  const top = base.grid as GridComponentOption
  const measureX = base.xAxis as Record<string, unknown>
  const window =
    props.window ??
    stripWindow(
      props.points.map((p) => p.at),
      0,
    )
  const { start: min, end: max } = window

  // Laid out from the bottom up: the strip, then the rows, then the measure takes the rest.
  let bottom = X_LABELS
  const grids: GridComponentOption[] = []
  const xAxes: Record<string, unknown>[] = []
  const yAxes: Record<string, unknown>[] = [base.yAxis as Record<string, unknown>]
  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    ...(base.series as (LineSeriesOption | ScatterSeriesOption)[]),
  ]
  const legends: LegendComponentOption[] = base.legend ? [base.legend as LegendComponentOption] : []
  const panel = (height: number) => {
    const grid = { left: PANEL_LEFT, right: 16, bottom, height }
    bottom += height
    return grid
  }

  let stripIndex = -1
  if (levels) {
    const grid = panel(stripPlot)
    legends.push({
      bottom: bottom + 2,
      left: PANEL_LEFT - 8,
      itemWidth: 28,
      itemHeight: 10,
      textStyle: { color: c.axis, fontFamily: c.font, fontSize: 11 },
      data: levels.series.map((s) => s.label),
    })
    bottom += STRIP_LEGEND + PANEL_GAP
    stripIndex = grids.push(grid) - 1
  }
  let laneIndex = -1
  if (lanes.length) {
    const grid = panel(lanes.length * laneRow)
    bottom += PANEL_GAP
    laneIndex = grids.push(grid) - 1
  }
  // Grids were made bottom-up; ECharts indexes them from 1 after the measure's.
  const gridIndex = (i: number) => grids.length - i

  grids.forEach((_, i) => {
    xAxes.push({
      ...measureX,
      gridIndex: gridIndex(i),
      min,
      max,
      // Only the lowest panel carries the dates.
      axisLabel: i === 0 ? measureX.axisLabel : { show: false },
      axisTick: { show: i === 0 },
    })
  })

  if (stripIndex >= 0 && levels) {
    const g = gridIndex(stripIndex)
    yAxes.push({
      type: 'value',
      gridIndex: g,
      ...levelAxis(levels, c),
      splitLine: { lineStyle: { color: c.grid } },
    })
    const axis = yAxes.length - 1
    for (const s of levels.series) {
      const color = c.series[s.slot] ?? c.preview
      series.push({
        name: s.label,
        type: 'line',
        xAxisIndex: g,
        yAxisIndex: axis,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: { width: 2, color, type: LEVEL_DASHES[s.slot], cap: 'round', join: 'round' },
        itemStyle: { color },
        data: s.points.map(([at, percent, amount]) => [
          at,
          levels.scale === 'amount' ? amount : percent,
        ]),
      })
    }
  }

  if (laneIndex >= 0) {
    const g = gridIndex(laneIndex)
    yAxes.push({
      type: 'value',
      gridIndex: g,
      min: -0.5,
      max: lanes.length - 0.5,
      inverse: true,
      show: false,
    })
    const axis = yAxes.length - 1
    lanes.forEach((lane, row) => {
      const color = c.series[lane.slot] ?? c.preview
      series.push({
        name: `${lane.label} doses`,
        type: 'scatter',
        xAxisIndex: g,
        yAxisIndex: axis,
        symbol: 'rect',
        symbolSize: [2, 10],
        symbolOffset: [0, 5],
        itemStyle: { color },
        // Labels sit above the ticks, so they never cover the doses that follow.
        label: {
          position: 'top',
          distance: 2,
          color: c.axis,
          fontFamily: c.font,
          fontSize: 10,
        },
        labelLayout: { hideOverlap: true },
        data: lane.marks.map((m) => ({
          value: [m.at, row],
          label: {
            show: m.changed,
            // Near the right edge a label reads leftward, so it stays inside the chart.
            align: m.at > min + (max - min) * 0.6 ? 'right' : 'left',
            formatter: m.first
              ? `${lane.label} ${amountText(m.amount, lane.unitLabel)}`
              : amountText(m.amount, lane.unitLabel),
          },
        })),
      })
    })
  }

  const measureGrid = { ...top, left: PANEL_LEFT, right: 16, containLabel: false, bottom }
  const levelNames = new Set(levels?.series.map((s) => s.label) ?? [])
  const laneNames = new Set(lanes.map((l) => `${l.label} doses`))
  return {
    ...base,
    grid: [measureGrid, ...[...grids].reverse()],
    legend: legends,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: c.surface,
      borderColor: c.grid,
      textStyle: { color: c.text, fontFamily: c.font },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const at = Number((list[0]?.value as [number, number] | undefined)?.[0])
        const measure = list
          .filter(
            (p) =>
              !levelNames.has(p.seriesName ?? '') &&
              !laneNames.has(p.seriesName ?? '') &&
              p.seriesName !== PHOTO_SERIES,
          )
          .map((p) => `${p.marker}${p.seriesName}: ${fmt((p.value as [number, number])[1])}`)
        if (!Number.isFinite(at)) return measure.join('<br>')
        const doses = lanesAt(lanes, at, SAME_DAY_MS).map(
          (d) => `${d.label} dose: ${d.amounts.map((a) => amountText(a, d.unitLabel)).join(', ')}`,
        )
        const readings = levels ? levels.readAt(at).map((r) => levelText(r, levels.scale)) : []
        return [...measure, ...doses, ...readings].join('<br>')
      },
    },
    xAxis: [{ ...measureX, min, max, axisLabel: { show: false } }, ...[...xAxes].reverse()],
    yAxis: yAxes,
    dataZoom: [{ type: 'inside', xAxisIndex: 'all', filterMode: 'none' }],
    series,
  } as BodyChartOption
}

/** The strip's value axis: round amounts from zero, or 0 to 100% of each line's peak. */
function levelAxis(levels: LevelStripInput, c: ChartColors) {
  if (levels.scale === 'percent') {
    return { min: 0, max: 100, interval: 50, axisLabel: { color: c.axis, formatter: '{value}%' } }
  }
  const ticks = amountTicks(levels.series)
  const unit = levels.series[0]?.unitLabel ?? ''
  return {
    min: ticks[0],
    max: ticks[ticks.length - 1],
    interval: ticks[1]! - ticks[0]!,
    axisLabel: { color: c.axis, formatter: (v: number) => `${roundTo(v, 2)} ${unit}` },
  }
}
