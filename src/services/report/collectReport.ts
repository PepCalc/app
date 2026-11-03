import { findPeptide } from '@/data'
import type { DrawRow, GlucoseRow, SymptomRow, VialRow } from '@/db/database'
import { bmi, bmiBand, BMI_BANDS, BMI_SOURCE } from '@/domain/body'
import {
  formatPercentChange,
  formatWeight,
  formatWeightChange,
  fromKg,
  type WeightUnit,
} from '@/domain/bodyUnits'
import { SOURCE_KIND_LABELS } from '@/domain/catalog'
import {
  decimalsFor,
  formatA1c,
  formatA1cChange,
  formatGlucose,
  fromA1cPercent,
  fromMgDl,
  GLUCOSE_CONTEXT_LABELS,
  type A1cUnit,
  type GlucoseUnit,
} from '@/domain/glucose'
import { levelKey, type PeptideLevels } from '@/domain/levels'
import { amountAt, rateConstants, simulate, summarizeLevels } from '@/domain/pk'
import { periodStart, reportWindow, totalsByUnit, type ReportPeriod } from '@/domain/report'
import { SEVERITIES, SEVERITY_LABELS, SYMPTOM_SOURCES, summarizeSymptoms } from '@/domain/symptoms'
import { formatAmount, roundTo, unitLabel, type Quantity } from '@/domain/units'
import { A4, LETTER, type PageSize } from '@/services/pdf/pageSize'
import {
  formatAxisTick,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatHours,
  toEpochMs,
} from '@/services/time'
import type {
  ReportChart,
  ReportCombined,
  ReportData,
  ReportPeptide,
  ReportSection,
  ReportSugar,
  ReportTimelineRow,
  ReportWeight,
} from './reportData'

export interface ReportSource {
  vials: readonly VialRow[]
  draws: readonly DrawRow[]
  /** Every draw pooled per peptide (the shelf store's `levelGroups`). */
  groups: readonly PeptideLevels[]
  /** How the app names a vial ("BPC-157 #2"). */
  vialName: (vial: VialRow) => string
  weights: readonly { measuredAt: string; kg: number }[]
  symptoms: readonly SymptomRow[]
  glucose: readonly GlucoseRow[]
  units: { weight: WeightUnit; a1c: A1cUnit; glucose: GlucoseUnit }
  profile: { heightCm: number | null }
  /** The sections the reader chose; those with nothing in the period are left out. */
  sections: readonly ReportSection[]
  period: ReportPeriod
  now: number
  /** BCP 47 locale, which picks the paper size. */
  locale: string
}

/** Regions that use US Letter paper; everywhere else uses A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'PR'])

export function pageSizeFor(locale: string): PageSize {
  try {
    const region = new Intl.Locale(locale).maximize().region
    return region && LETTER_REGIONS.has(region) ? LETTER : A4
  } catch {
    return A4
  }
}

const DAY_MS = 86_400_000
const formatQuantity = (q: Quantity) => `${roundTo(q.value, 4)} ${unitLabel(q.unit)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The source's rows inside the period, newest first. */
function inPeriod(source: Omit<ReportSource, 'sections'>) {
  const since = periodStart(source.period, source.now)
  const within = <T>(list: readonly T[], at: (row: T) => string) =>
    list
      .filter((r) => toEpochMs(at(r)) >= since && toEpochMs(at(r)) <= source.now)
      .sort((a, b) => toEpochMs(at(b)) - toEpochMs(at(a)))
  const vialsById = new Map(source.vials.map((v) => [v.id, v]))
  const draws = within(
    source.draws.filter((d) => vialsById.has(d.vialId)),
    (d) => d.takenAt,
  )
  return {
    since,
    vialsById,
    draws,
    weights: within(source.weights, (w) => w.measuredAt),
    symptoms: within(source.symptoms, (s) => s.occurredAt),
    a1c: within(
      source.glucose.filter((g) => g.kind === 'a1c'),
      (g) => g.measuredAt,
    ),
    glucose: within(
      source.glucose.filter((g) => g.kind === 'glucose'),
      (g) => g.measuredAt,
    ),
  }
}

type Rows = ReturnType<typeof inPeriod>

/** The pooled peptides with draws in the period, with or without a level curve. */
function drawnGroups(source: Omit<ReportSource, 'sections'>, rows: Rows) {
  const keys = new Set(rows.draws.map((d) => levelKey(rows.vialsById.get(d.vialId)!)))
  return source.groups.filter((g) => keys.has(g.key))
}

/**
 * Which sections have anything to print for the period, so the export dialog can offer only
 * those. The combined chart needs at least one series or row of events.
 */
export function availableSections(source: Omit<ReportSource, 'sections'>): Set<ReportSection> {
  const rows = inPeriod(source)
  const out = new Set<ReportSection>()
  if (rows.draws.length) out.add('levels').add('draws')
  if (rows.weights.length) out.add('weight')
  if (rows.a1c.length || rows.glucose.length) out.add('sugar')
  if (rows.symptoms.length) out.add('symptoms')
  if (
    rows.draws.length ||
    rows.weights.length ||
    rows.a1c.length ||
    rows.glucose.length ||
    rows.symptoms.length
  )
    out.add('combined')
  return out
}

function describePeptide(
  group: PeptideLevels,
  draws: readonly DrawRow[],
  since: number,
  now: number,
): ReportPeptide {
  const unit = unitLabel(group.unit)
  const stats: [string, string][] = [
    ['Draws', String(draws.length)],
    [
      'Total drawn',
      totalsByUnit(draws.map((d) => d.dose))
        .map(formatQuantity)
        .join(' + '),
    ],
  ]
  const peptide = findPeptide(group.peptideId)
  const base = { name: group.label, stats }

  if (!group.pk) {
    return {
      ...base,
      pk: null,
      curve: null,
      noCurveReason:
        peptide?.pkUnavailableReason ??
        'No level curve: custom peptides have no published data. Enter a half-life and time ' +
          'to peak on the vial to see one.',
    }
  }

  const { params, userSupplied } = group.pk
  const { trimmed, ...window } = reportWindow(group.doses, params, now, since)
  const points = simulate(group.doses, params, window)
  const summary = summarizeLevels(points, group.doses, params, now)
  stats.push([
    'Estimated now',
    formatAmount(amountAt(now, group.doses, rateConstants(params)), unit),
  ])
  if (summary.peak) stats.push(['Highest on chart', formatAmount(summary.peak.amount, unit)])
  const leftOut = draws.length - group.doses.filter((d) => d.at >= since).length
  if (leftOut > 0) stats.push(['Not in curve', `${plural(leftOut, 'draw')} in another unit`])

  const catalogPk = userSupplied ? null : peptide?.pk
  const best = catalogPk?.sources.some((s) => s.kind === 'label') ? 'label' : 'trial'
  return {
    ...base,
    pk: {
      halfLife: formatHours(params.halfLifeHours),
      peak: formatHours(params.tmaxHours),
      sourceLabel: userSupplied ? 'User-supplied values' : SOURCE_KIND_LABELS[best],
      userSupplied,
      notes: catalogPk?.notes ?? '',
      citations: (catalogPk?.sources ?? []).map(
        (s) => `${SOURCE_KIND_LABELS[s.kind]}: ${s.citation}${s.url ? ` (${s.url})` : ''}`,
      ),
    },
    curve: {
      chart: {
        title: null,
        window,
        scale: 'zero',
        unitLabel: unit,
        decimals: 3,
        series: [
          {
            label: 'Estimated amount',
            style: 'area',
            tone: 'logged',
            points: points.map((p) => ({ at: p.at, value: p.amount })),
          },
        ],
        markers: group.doses
          .filter((d) => d.at >= window.start && d.at <= window.end)
          .map((d) => d.at),
        guides: [],
        now,
      },
      note: trimmed
        ? 'Short-acting: the chart shows the 3 days up to the latest dose. Every draw in the ' +
          'period is in the totals and the draw log.'
        : null,
    },
    noCurveReason: null,
  }
}

const chronological = <T>(rows: readonly T[]) => [...rows].reverse()

function weightChart(
  source: Omit<ReportSource, 'sections'>,
  rows: Rows,
  title: string | null,
  window: ReportChart['window'],
): ReportChart {
  return {
    title,
    window,
    scale: 'fit',
    unitLabel: source.units.weight,
    decimals: 1,
    series: [
      {
        label: 'Weight',
        style: 'line',
        tone: 'logged',
        points: chronological(rows.weights).map((w) => ({
          at: toEpochMs(w.measuredAt),
          value: fromKg(w.kg, source.units.weight),
        })),
      },
    ],
    markers: [],
    guides: [],
    now: null,
  }
}

function a1cChart(
  source: Omit<ReportSource, 'sections'>,
  rows: Rows,
  title: string | null,
  window: ReportChart['window'],
): ReportChart {
  const unit = source.units.a1c
  return {
    title,
    window,
    scale: 'fit',
    unitLabel: unit,
    decimals: decimalsFor(unit),
    series: [
      {
        label: 'HbA1c',
        style: 'line',
        tone: 'logged',
        points: chronological(rows.a1c).map((g) => ({
          at: toEpochMs(g.measuredAt),
          value: fromA1cPercent(g.value, unit),
        })),
      },
    ],
    markers: [],
    guides: [],
    now: null,
  }
}

/**
 * Fasting readings as the line and readings at other times as hollow points: they are not
 * comparable with each other, as on the app's trend chart.
 */
function glucoseChart(
  source: Omit<ReportSource, 'sections'>,
  rows: Rows,
  title: string | null,
  window: ReportChart['window'],
): ReportChart {
  const unit = source.units.glucose
  const point = (g: GlucoseRow) => ({
    at: toEpochMs(g.measuredAt),
    value: fromMgDl(g.value, unit),
  })
  const all = chronological(rows.glucose)
  const fasting = all.filter((g) => g.context === 'fasting').map(point)
  const other = all.filter((g) => g.context !== 'fasting').map(point)
  return {
    title,
    window,
    scale: 'fit',
    unitLabel: unit,
    decimals: decimalsFor(unit),
    series: [
      ...(fasting.length
        ? [{ label: 'Fasting', style: 'line' as const, tone: 'logged' as const, points: fasting }]
        : []),
      ...(other.length
        ? [
            {
              label: 'Other times',
              style: 'hollow' as const,
              tone: 'preview' as const,
              points: other,
            },
          ]
        : []),
    ],
    markers: [],
    guides: [],
    now: null,
  }
}

/** The span of a list of readings, or null with fewer than two. */
function spanOf(times: readonly number[]): ReportChart['window'] | null {
  if (times.length < 2) return null
  const start = Math.min(...times)
  const end = Math.max(...times)
  return end > start ? { start, end } : null
}

function collectWeight(source: Omit<ReportSource, 'sections'>, rows: Rows): ReportWeight {
  const { units, profile } = source
  const series = chronological(rows.weights)
  const first = series[0]!
  const last = series[series.length - 1]!
  const stats: [string, string][] = [
    ['First', formatWeight(first.kg, units.weight)],
    ['Latest', formatWeight(last.kg, units.weight)],
  ]
  if (series.length > 1) {
    stats.push([
      'Change',
      `${formatWeightChange(last.kg - first.kg, units.weight)} (${formatPercentChange(((last.kg - first.kg) / first.kg) * 100)})`,
    ])
  }
  stats.push(['Weigh-ins', String(series.length)])

  const window = spanOf(series.map((w) => toEpochMs(w.measuredAt)))
  const notes: string[] = []
  let bmiChart: ReportChart | null = null
  const height = profile.heightCm
  if (height) {
    const latest = bmi(last.kg, height)
    stats.push(['BMI', String(roundTo(latest, 1))])
    stats.push(['BMI band', bmiBand(latest).label])
    const values = series.map((w) => ({ at: toEpochMs(w.measuredAt), value: bmi(w.kg, height) }))
    if (window) {
      const lo = Math.min(...values.map((v) => v.value)) - 4
      const hi = Math.max(...values.map((v) => v.value)) + 4
      bmiChart = {
        title: 'Body mass index',
        window,
        scale: 'fit',
        unitLabel: '',
        decimals: 1,
        series: [{ label: 'BMI', style: 'line', tone: 'logged', points: values }],
        markers: [],
        // Only band edges near the reader's own values, so the axis is not stretched.
        guides: BMI_BANDS.filter((b) => b.from > 0 && b.from >= lo && b.from <= hi).map((b) => ({
          value: b.from,
          label: b.label,
        })),
        now: null,
      }
    }
    notes.push(
      `BMI is weight over height squared, from the height in the profile (${roundTo(height, 1)} cm). ` +
        'It is a population screening measure, not a diagnosis. ' +
        `Bands: ${BMI_SOURCE.citation} (${BMI_SOURCE.url}).`,
    )
  }
  return {
    stats,
    weight: window ? weightChart(source, rows, `Weight (${units.weight})`, window) : null,
    bmi: bmiChart,
    notes,
  }
}

function collectSugar(source: Omit<ReportSource, 'sections'>, rows: Rows): ReportSugar {
  const { units } = source
  const a1cWindow = spanOf(rows.a1c.map((g) => toEpochMs(g.measuredAt)))
  const glucoseWindow = spanOf(rows.glucose.map((g) => toEpochMs(g.measuredAt)))
  return {
    a1cChart: a1cWindow ? a1cChart(source, rows, `HbA1c (${units.a1c})`, a1cWindow) : null,
    glucoseChart: glucoseWindow
      ? glucoseChart(source, rows, `Glucose (${units.glucose})`, glucoseWindow)
      : null,
    a1c: {
      columns: [
        { title: 'Date', width: 0.2, align: 'left' },
        { title: 'HbA1c', width: 0.16, align: 'right' },
        { title: 'Change', width: 0.18, align: 'right' },
        { title: 'Notes', width: 0.46, align: 'left', muted: true },
      ],
      rows: rows.a1c.map((g, i) => {
        const previous = rows.a1c[i + 1]
        return [
          formatDate(g.measuredAt),
          formatA1c(g.value, units.a1c),
          previous ? formatA1cChange(g.value - previous.value, units.a1c) : '',
          g.notes,
        ]
      }),
      empty: 'No HbA1c results in this period.',
    },
    glucose: {
      columns: [
        { title: 'When', width: 0.26, align: 'left' },
        { title: 'Glucose', width: 0.16, align: 'right' },
        { title: 'Timing', width: 0.18, align: 'left' },
        { title: 'Notes', width: 0.4, align: 'left', muted: true },
      ],
      rows: rows.glucose.map((g) => [
        formatDateTime(g.measuredAt),
        formatGlucose(g.value, units.glucose),
        GLUCOSE_CONTEXT_LABELS[g.context],
        g.notes,
      ]),
      empty: 'No glucose readings in this period.',
    },
  }
}

/**
 * The other chosen sections on one time axis, as stacked panels rather than a second value
 * axis: weight, blood sugar, and each peptide's estimated level over the whole period
 * (short-acting peptides draw as a row of spikes). Peptides without a curve and side effects
 * are rows of events below. A section left out stays out of this chart too, so leaving out
 * side effects keeps them out of the whole file. Null when no chosen section has data.
 */
function collectCombined(
  source: Omit<ReportSource, 'sections'>,
  rows: Rows,
  window: ReportChart['window'],
  chosen: ReadonlySet<ReportSection>,
): ReportCombined | null {
  const panels: ReportChart[] = []
  const sugar = chosen.has('sugar')
  if (chosen.has('weight') && rows.weights.length)
    panels.push(weightChart(source, rows, `Weight (${source.units.weight})`, window))
  if (sugar && rows.a1c.length)
    panels.push(a1cChart(source, rows, `HbA1c (${source.units.a1c})`, window))
  if (sugar && rows.glucose.length)
    panels.push(glucoseChart(source, rows, `Glucose (${source.units.glucose})`, window))

  const timeline: ReportTimelineRow[] = []
  const peptides = chosen.has('levels') || chosen.has('draws')
  for (const group of peptides ? drawnGroups(source, rows) : []) {
    const markers = group.doses
      .filter((d) => d.at >= window.start && d.at <= window.end)
      .map((d) => d.at)
    if (!group.pk) {
      const own = rows.draws.filter((d) => levelKey(rows.vialsById.get(d.vialId)!) === group.key)
      timeline.push({ label: `${group.label} draws`, at: own.map((d) => toEpochMs(d.takenAt)) })
      continue
    }
    const points = simulate(group.doses, group.pk.params, window, 400)
    panels.push({
      title: `${group.label}, estimated (${unitLabel(group.unit)})`,
      window,
      scale: 'zero',
      unitLabel: unitLabel(group.unit),
      decimals: 3,
      series: [
        {
          label: 'Estimated amount',
          style: 'area',
          tone: 'logged',
          points: points.map((p) => ({ at: p.at, value: p.amount })),
        },
      ],
      markers,
      guides: [],
      now: null,
    })
  }
  if (chosen.has('symptoms') && rows.symptoms.length) {
    timeline.push({ label: 'Side effects', at: rows.symptoms.map((s) => toEpochMs(s.occurredAt)) })
  }

  if (!panels.length && !timeline.length) return null
  const notes = ['Each panel has its own scale; they share only the time axis.']
  if (panels.some((p) => p.scale === 'zero')) notes.push(LEVELS_NOTE)
  return { window, panels, timeline, notes }
}

const LEVELS_NOTE =
  'Estimated levels are the amount left in the body from logged doses, not blood levels, from ' +
  'a simple model of the half-life and time to peak. Triangles mark draws.'

/** A title naming what the report holds. */
function titleFor(sections: ReadonlySet<ReportSection>): string {
  const shelf = sections.has('levels') || sections.has('draws')
  const journal = sections.has('weight') || sections.has('sugar') || sections.has('symptoms')
  if (shelf && journal) return 'Peptides and journal'
  if (shelf) return 'Draws and estimated levels'
  if (journal) return 'Journal'
  return 'Combined chart'
}

/**
 * Gather what the report prints for `period` and the chosen sections, formatted for the
 * reader's locale and units. Level curves count every logged dose, including those before the
 * period, because earlier doses are still in the body; the chart starts at the period. Tables
 * are newest first, as the Protocols tab lists them.
 */
export function collectReport(source: ReportSource): ReportData {
  const { period, now, units } = source
  const rows = inPeriod(source)
  const available = availableSections(source)
  const chosen = new Set(source.sections.filter((s) => available.has(s)))

  const times = [
    ...rows.draws.map((d) => d.takenAt),
    ...rows.weights.map((w) => w.measuredAt),
    ...rows.symptoms.map((s) => s.occurredAt),
    ...rows.a1c.map((g) => g.measuredAt),
    ...rows.glucose.map((g) => g.measuredAt),
  ].map(toEpochMs)
  const oldest = Math.min(now, ...times)
  const start = Number.isFinite(rows.since) ? rows.since : oldest
  const periodLabel =
    period === 'all'
      ? `Everything logged (${formatDateRange(start, now)})`
      : `Last ${period === '30d' ? 30 : 90} days (${formatDateRange(start, now)})`

  const groups = drawnGroups(source, rows)
  const peptides = chosen.has('levels')
    ? groups.map((group) =>
        describePeptide(
          group,
          rows.draws.filter((d) => levelKey(rows.vialsById.get(d.vialId)!) === group.key),
          rows.since,
          now,
        ),
      )
    : null

  const weight = chosen.has('weight') ? collectWeight(source, rows) : null
  const summary: [string, string][] = []
  if (rows.draws.length) {
    summary.push(['Draws', String(rows.draws.length)], ['Peptides', String(groups.length)])
  }
  if (rows.weights.length > 1) {
    const [latest, first] = [rows.weights[0]!, rows.weights[rows.weights.length - 1]!]
    summary.push([
      'Weight change',
      `${formatWeightChange(latest.kg - first.kg, units.weight)} (${formatPercentChange(((latest.kg - first.kg) / first.kg) * 100)})`,
    ])
  }
  if (rows.a1c[0]) summary.push(['Latest HbA1c', formatA1c(rows.a1c[0].value, units.a1c)])
  if (rows.symptoms.length) summary.push(['Side effects logged', String(rows.symptoms.length)])

  const symptoms = chosen.has('symptoms')
    ? {
        table: {
          columns: [
            { title: 'Side effect', width: 0.3, align: 'left' },
            { title: 'Times', width: 0.08, align: 'right' },
            { title: 'Strength', width: 0.26, align: 'left' },
            { title: 'Usually', width: 0.22, align: 'left' },
            { title: 'Last', width: 0.14, align: 'left' },
          ] as const,
          rows: summarizeSymptoms(
            rows.symptoms.map((s) => ({ ...s, at: toEpochMs(s.occurredAt) })),
            source.draws.map((d) => toEpochMs(d.takenAt)),
            rows.since,
          ).map((s) => [
            s.name,
            String(s.count),
            SEVERITIES.filter((l) => s.bySeverity[l])
              .map((l) => `${s.bySeverity[l]} ${SEVERITY_LABELS[l].toLowerCase()}`)
              .join(', '),
            s.medianDaysAfterDose === null
              ? 'Before any draw'
              : `${plural(roundTo(s.medianDaysAfterDose, 1), 'day')} after a draw`,
            formatDate(s.lastAt),
          ]),
          empty: 'No side effects logged in this period.',
        },
        notes: [
          '"Usually" is the median time from the draw before each entry, of any peptide. ' +
            'Strength: mild, noticeable but not in the way; moderate, got in the way of some ' +
            'things; severe, stopped them.',
          `The side effects offered in PepCalc come from: ${SYMPTOM_SOURCES.map((s) => s.citation).join('; ')}.`,
        ],
      }
    : null

  const draws = chosen.has('draws')
    ? {
        columns: [
          { title: 'When', width: 0.22, align: 'left' },
          { title: 'Peptide or vial', width: 0.26, align: 'left' },
          { title: 'Dose', width: 0.12, align: 'right' },
          { title: 'Volume', width: 0.11, align: 'right' },
          { title: 'Notes', width: 0.29, align: 'left', muted: true },
        ] as const,
        rows: rows.draws.map((d) => [
          formatDateTime(d.takenAt),
          source.vialName(rows.vialsById.get(d.vialId)!),
          formatQuantity(d.dose),
          `${roundTo(d.volumeMl, 3)} mL`,
          d.notes,
        ]),
        empty: 'No draws were logged in this period.',
      }
    : null

  const journal = chosen.has('weight') || chosen.has('sugar') || chosen.has('symptoms')
  const about = [
    'PepCalc does arithmetic and shows sourced references. It never recommends a dose and is ' +
      'not medical advice.',
    'Draws are those logged in PepCalc on this device. IU doses are never converted to mass. ' +
      'Level curves include every logged draw of a peptide, across all its vials.',
    'Built-in half-lives and peak times come only from human data (a label or a clinical ' +
      'trial). Values marked user-supplied were entered by the person who made this report.',
    ...(journal
      ? [
          'Weights, blood sugar and side effects are entered by the person who made this ' +
            'report; PepCalc does not check them.',
        ]
      : []),
  ]

  return {
    pageSize: pageSizeFor(source.locale),
    title: titleFor(chosen),
    generated: formatDateTime(now),
    periodLabel,
    summary,
    combined: chosen.has('combined')
      ? collectCombined(
          source,
          rows,
          { start: start === now ? now - DAY_MS : start, end: now },
          chosen,
        )
      : null,
    peptides,
    weight,
    sugar: chosen.has('sugar') ? collectSugar(source, rows) : null,
    symptoms,
    draws,
    about,
    formatTick: formatAxisTick,
  }
}
