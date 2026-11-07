import type { PageSize } from '@/services/pdf/pageSize'

/**
 * What the PDF report prints, already formatted for the reader's locale and units. The
 * collector (`collectReport`) builds it from the stores; the renderer (`renderReport`) only
 * places it. A section the reader left out is null.
 */

/** The parts of the report the reader can choose, in the order they print. */
export const REPORT_SECTIONS = [
  'combined',
  'levels',
  'weight',
  'sugar',
  'vitals',
  'symptoms',
  'draws',
] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

export interface ReportSeries {
  label: string
  /**
   * `area` is a curve filled down to zero (estimated levels); `line` joins readings, and
   * `dashed` joins a second set beside it (diastolic under systolic); `points` and `hollow` are
   * unjoined readings, told apart by shape rather than colour alone.
   */
  style: 'line' | 'dashed' | 'area' | 'points' | 'hollow'
  tone: 'logged' | 'preview'
  /** Oldest first, in the unit the chart is labelled in. */
  points: readonly { at: number; value: number }[]
}

/** A chart over time, already in the reader's units; the renderer draws but never computes. */
export interface ReportChart {
  /** Printed above the plot, such as "Weight (kg)"; null when the section heading says it. */
  title: string | null
  window: { start: number; end: number }
  /** `zero` starts the axis at zero (amounts); `fit` spans the values (body measures). */
  scale: 'zero' | 'fit'
  unitLabel: string
  decimals: number
  series: readonly ReportSeries[]
  /** Draws, marked as triangles on the baseline. */
  markers: readonly number[]
  /** Dashed reference lines, such as BMI band edges. */
  guides: readonly { value: number; label: string }[]
  /** A dashed "Now" line when it falls inside the window. */
  now: number | null
}

/** A row of instants on the combined chart's time axis: draws without a curve, side effects. */
export interface ReportTimelineRow {
  label: string
  at: readonly number[]
}

export interface ReportColumn {
  title: string
  /** Share of the page width, the columns summing to 1. */
  width: number
  align: 'left' | 'right'
  /** Printed in the secondary text colour, as for notes. */
  muted?: boolean
}

export interface ReportTable {
  columns: readonly ReportColumn[]
  rows: readonly (readonly string[])[]
  /** Shown in place of the table when there are no rows. */
  empty: string
}

export type ReportStats = readonly (readonly [string, string])[]

/** Where a curve's half-life and time to peak came from. */
interface ReportPk {
  halfLife: string
  peak: string
  /** "Prescribing label", "Clinical trial" or "User-supplied values". */
  sourceLabel: string
  userSupplied: boolean
  /** Ranges or caveats from the source. */
  notes: string
  citations: readonly string[]
}

export interface ReportPeptide {
  name: string
  /** Pre-formatted headline figures, such as ["Draws", "6"] or ["Estimated now", "0.31 mg"]. */
  stats: ReportStats
  pk: ReportPk | null
  /** The logged-dose level curve, with a note such as why it shows fewer days than the period. */
  curve: { chart: ReportChart; note: string | null } | null
  /** Why there is no curve, shown in its place. */
  noCurveReason: string | null
}

export interface ReportCombined {
  /** The period: every panel and the timeline share it. */
  window: { start: number; end: number }
  /** Stacked on one time axis, top to bottom. */
  panels: readonly ReportChart[]
  timeline: readonly ReportTimelineRow[]
  notes: readonly string[]
}

export interface ReportWeight {
  stats: ReportStats
  /** Null with fewer than two weigh-ins. */
  weight: ReportChart | null
  /** Null without a height in the profile, or with fewer than two weigh-ins. */
  bmi: ReportChart | null
  notes: readonly string[]
}

export interface ReportSugar {
  a1cChart: ReportChart | null
  glucoseChart: ReportChart | null
  a1c: ReportTable
  glucose: ReportTable
}

export interface ReportVitals {
  stats: ReportStats
  /** Null with fewer than two readings at different times. */
  bloodPressureChart: ReportChart | null
  heartRateChart: ReportChart | null
  bloodPressure: ReportTable
  heartRate: ReportTable
}

export interface ReportData {
  pageSize: PageSize
  title: string
  generated: string
  periodLabel: string
  /** Headline figures for the period, label then value. */
  summary: ReportStats
  combined: ReportCombined | null
  peptides: readonly ReportPeptide[] | null
  weight: ReportWeight | null
  sugar: ReportSugar | null
  vitals: ReportVitals | null
  symptoms: { table: ReportTable; notes: readonly string[] } | null
  draws: ReportTable | null
  /** Closing notes on what the numbers are and where they came from. */
  about: readonly string[]
  /** Axis label for an instant; `spanMs` lets it drop the date or the time. */
  formatTick: (epochMs: number, spanMs: number) => string
}
