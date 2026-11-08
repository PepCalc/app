<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  decimalsFor,
  formatA1c,
  formatA1cChange,
  formatGlucose,
  formatGlucoseChange,
  fromA1cPercent,
  fromMgDl,
} from '@/domain/glucose'
import { formatPercentChange, formatWeight, formatWeightChange, fromKg } from '@/domain/bodyUnits'
import { roundTo } from '@/domain/units'
import {
  formatBloodPressure,
  formatBloodPressureChange,
  formatHeartRate,
  formatHeartRateChange,
} from '@/domain/vitals'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { valueAt } from '@/domain/photos'
import { useSettingsStore } from '@/stores/settings'
import { useBodyMetrics } from '@/composables/useBodyMetrics'
import { useChartColors } from '@/composables/useChartColors'
import { formatDate, formatDateTime, nowIso, toEpochMs } from '@/services/time'
import {
  bodyChartOption,
  panelInput,
  type BodyChartInput,
  type PanelPeptide,
} from '@/components/charts/bodyChart'
import { stripScale } from '@/domain/levelStrip'
import ShareImageDialog from './ShareImageDialog.vue'
import type { ShareCardContent } from './shareCard'

/**
 * Share a trend (weight, BMI, HbA1c, glucose, blood pressure or heart rate) as an image.
 * Numbers are off by default: weight then shows as percent change and the other measures as
 * change only, with no axis values, so a card can be shared without revealing a weight or a
 * lab result.
 *
 * Dose rows and estimated levels can go under the line, for the first SHARE_PEPTIDES peptides
 * picked in the app; both are off by default. Names are off too, since several of these
 * peptides are investigational: the rows then read "Peptide A", "Peptide B". Levels follow the
 * numbers choice: in the peptide's unit beside values, as percent of peak beside a change only.
 */
const props = defineProps<{
  measure: 'weight' | 'bmi' | 'a1c' | 'glucose' | 'cgm' | 'bp' | 'hr'
  now: number
  /** Photos that can be pinned to the weight line (see TrendCard). */
  photos?: { id: string; at: number }[]
  /** The peptides picked for the trend card's rows and strip, with their colours. */
  peptides?: PanelPeptide[]
}>()
const open = defineModel<boolean>({ required: true })

const journal = useJournalStore()
const settings = useSettingsStore()
const body = useBodyMetrics()
const { colors } = useChartColors()
const showNumbers = ref(false)
// Off by default: whoever receives the image sees the photos.
const showPhotos = ref(false)
const photosStore = usePhotosStore()
const showDoses = ref(false)
const showLevels = ref(false)
const showNames = ref(false)

/** The share image's chart fits about two dose rows beside the level strip. */
const SHARE_PEPTIDES = 2
const shared = computed(() => (props.peptides ?? []).slice(0, SHARE_PEPTIDES))
const canPeptides = computed(() => shared.value.length > 0)
const canLevels = computed(() => shared.value.some((p) => p.strip))

/** The shared peptides, renamed "Peptide A", "Peptide B" while names are off. */
const named = computed<PanelPeptide[]>(() =>
  shared.value.map((p, i) => {
    if (showNames.value) return p
    const label = `Peptide ${String.fromCharCode(65 + i)}`
    return { ...p, label, strip: p.strip ? { ...p.strip, label } : null }
  }),
)

/** The chosen rows and strip on a card's chart, over the dates of its entries. */
function withExtras(input: BodyChartInput, inPercent: boolean): BodyChartInput {
  if (!(showDoses.value || showLevels.value) || !named.value.length) return input
  const times = [...input.points, ...(input.secondary?.points ?? [])].map((p) => p.at)
  if (!times.length) return input
  const curves = named.value.filter((p) => p.strip).length
  return {
    ...input,
    ...panelInput(named.value, times, props.now, {
      lanes: showDoses.value,
      levels: showLevels.value,
      scale: stripScale(inPercent, curves),
    }),
  }
}

/** The caption's sentence for the rows and strip, which carries where half-lives came from. */
function extrasCaption(input: BodyChartInput): string {
  const parts: string[] = []
  if (input.lanes) parts.push(' Ticks are logged doses.')
  if (input.levels) {
    const userSupplied = shared.value.some((p) => p.strip && p.userSupplied)
    parts.push(
      userSupplied
        ? ' Levels estimated from published and user-supplied half-lives.'
        : ' Levels estimated from published half-lives.',
    )
  }
  return parts.join('')
}

const WEEK_MS = 7 * 86_400_000
const byTime = <T extends { at: number }>(list: T[]) => [...list].sort((a, b) => a.at - b.at)
const madeAt = () => formatDateTime(nowIso())

/** `hideValues` defaults to hiding the axis while numbers are off. */
function card(
  eyebrow: string,
  title: string,
  stats: [string, string][],
  input: BodyChartInput,
  caption: string,
  hideValues = !showNumbers.value,
): ShareCardContent {
  const full = withExtras(input, !showNumbers.value)
  return {
    eyebrow,
    title,
    stats,
    chart: bodyChartOption(full, colors.value, { hideValues, compact: true }),
    caption: caption + extrasCaption(full),
    madeAt: madeAt(),
  }
}

function weightCard(): ShareCardContent | null {
  const change = journal.change
  if (!change) return null
  const base = change.first
  const sinceText = formatDate(base.at)
  const weeks = roundTo((change.latest.at - base.at) / WEEK_MS, 0)
  const stats: [string, string][] = [['Since', sinceText]]
  if (weeks > 0) stats.push(['Weeks', String(weeks)])
  if (showNumbers.value) stats.push(['Now', formatWeight(change.latest.kg, settings.weightUnit)])
  const points = byTime(
    journal.weights.map((w) => ({
      at: toEpochMs(w.measuredAt),
      value: showNumbers.value
        ? fromKg(w.kg, settings.weightUnit)
        : ((w.kg - base.kg) / base.kg) * 100,
    })),
  ).filter((p) => p.at >= base.at)
  const title = showNumbers.value
    ? `${formatWeightChange(change.changeKg, settings.weightUnit)} (${formatPercentChange(change.changePercent)})`
    : formatPercentChange(change.changePercent)
  // Pins sit on the line the card draws, whichever measure it is in.
  const pinned = showPhotos.value
    ? (props.photos ?? []).flatMap((p) => {
        const value = valueAt(points, p.at)
        const src = photosStore.thumbUrls[p.id]
        return value !== null && src ? [{ at: p.at, value, src }] : []
      })
    : []
  const input = withExtras(
    {
      points,
      unitLabel: showNumbers.value ? settings.weightUnit : '%',
      measure: 'Weight',
      decimals: 1,
      guides: [],
    },
    !showNumbers.value,
  )
  // Percent change keeps its axis: it reveals no weight.
  return {
    eyebrow: 'Weight',
    title,
    stats,
    chart: bodyChartOption(input, colors.value, { pinRoom: pinned.length > 0, compact: true }),
    caption:
      `Weight change since ${sinceText}, from weigh-ins logged in PepCalc.` + extrasCaption(input),
    madeAt: madeAt(),
    photos: pinned,
  }
}

function bmiCard(): ShareCardContent | null {
  const series = body.bmiSeries.value
  const first = series[0]
  const last = series[series.length - 1]
  if (!first || !last) return null
  const change = last.value - first.value
  const sign = change > 0 ? '+' : change < 0 ? '−' : ''
  const changeText = `${sign}${roundTo(Math.abs(change), 1)}`
  return card(
    'Body mass index',
    showNumbers.value ? `BMI ${roundTo(last.value, 1)}` : `${changeText} BMI`,
    [
      ['Since', formatDate(first.at)],
      ['Change', changeText],
    ],
    { points: series, unitLabel: '', measure: 'BMI', decimals: 1, guides: [] },
    'Body mass index from weigh-ins and height logged in PepCalc.',
  )
}

function a1cCard(): ShareCardContent | null {
  const readings = byTime(
    journal.glucose
      .filter((g) => g.kind === 'a1c')
      .map((g) => ({ at: toEpochMs(g.measuredAt), value: g.value })),
  )
  const first = readings[0]
  const last = readings[readings.length - 1]
  if (!first || !last) return null
  const change = formatA1cChange(last.value - first.value, settings.a1cUnit)
  const stats: [string, string][] = [['Since', formatDate(first.at)]]
  if (showNumbers.value) stats.push(['Latest', formatA1c(last.value, settings.a1cUnit)])
  stats.push(['Results', String(readings.length)])
  return card(
    'HbA1c',
    // A single result has no change to show, so with numbers off the title names the measure.
    readings.length > 1
      ? change
      : showNumbers.value
        ? formatA1c(last.value, settings.a1cUnit)
        : 'HbA1c',
    stats,
    {
      points: readings.map((r) => ({ at: r.at, value: fromA1cPercent(r.value, settings.a1cUnit) })),
      unitLabel: settings.a1cUnit,
      measure: 'HbA1c',
      decimals: decimalsFor(settings.a1cUnit),
      guides: [],
    },
    'HbA1c results logged in PepCalc.',
  )
}

function glucoseCard(): ShareCardContent | null {
  const all = journal.glucose.filter((g) => g.kind === 'glucose')
  const fasting = byTime(
    all
      .filter((g) => g.kind === 'glucose' && g.context === 'fasting')
      .map((g) => ({ at: toEpochMs(g.measuredAt), value: g.value })),
  )
  const other = byTime(
    all
      .filter((g) => g.kind === 'glucose' && g.context !== 'fasting')
      .map((g) => ({ at: toEpochMs(g.measuredAt), value: g.value })),
  )
  const latest = fasting[fasting.length - 1]
  if (!all.length) return null
  const toPoint = (r: { at: number; value: number }) => ({
    at: r.at,
    value: fromMgDl(r.value, settings.glucoseUnit),
  })
  const stats: [string, string][] = [['Readings', String(all.length)]]
  if (showNumbers.value && latest)
    stats.unshift(['Latest fasting', formatGlucose(latest.value, settings.glucoseUnit)])
  return card(
    'Glucose',
    'Blood glucose',
    stats,
    {
      points: fasting.map(toPoint),
      secondary: other.length ? { name: 'Other times', points: other.map(toPoint) } : undefined,
      unitLabel: settings.glucoseUnit,
      measure: 'Fasting',
      decimals: decimalsFor(settings.glucoseUnit),
      guides: [],
    },
    'Glucose readings logged in PepCalc: fasting as a line, other times of day as points.',
  )
}

function cgmCard(): ShareCardContent | null {
  const days = byTime(
    journal.glucose.flatMap((g) =>
      g.kind === 'daily' ? [{ at: toEpochMs(g.measuredAt), value: g.value, median: g.median }] : [],
    ),
  )
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return null
  const unit = settings.glucoseUnit
  const stats: [string, string][] = [['Since', formatDate(first.at)]]
  if (showNumbers.value) stats.push(['Latest average', formatGlucose(last.value, unit)])
  stats.push(['Days', String(days.length)])
  return card(
    'Glucose monitor',
    days.length > 1
      ? `${formatGlucoseChange(last.value - first.value, unit)} average`
      : 'Glucose monitor',
    stats,
    {
      points: days.map((d) => ({ at: d.at, value: fromMgDl(d.value, unit) })),
      secondary: {
        name: 'Median',
        joined: true,
        points: days.map((d) => ({ at: d.at, value: fromMgDl(d.median, unit) })),
      },
      unitLabel: unit,
      measure: 'Daily average',
      decimals: decimalsFor(unit),
      guides: [],
    },
    'Daily glucose monitor averages synced to PepCalc: average solid, median dashed.',
  )
}

function bpCard(): ShareCardContent | null {
  const readings = byTime(
    journal.vitals.flatMap((v) =>
      v.kind === 'bp'
        ? [{ at: toEpochMs(v.measuredAt), systolic: v.systolic, diastolic: v.diastolic }]
        : [],
    ),
  )
  const first = readings[0]
  const last = readings[readings.length - 1]
  if (!first || !last) return null
  const stats: [string, string][] = [['Since', formatDate(first.at)]]
  if (showNumbers.value) stats.push(['Latest', formatBloodPressure(last.systolic, last.diastolic)])
  stats.push(['Readings', String(readings.length)])
  const change = formatBloodPressureChange(
    last.systolic - first.systolic,
    last.diastolic - first.diastolic,
  )
  return card(
    'Blood pressure',
    // A single reading has no change to show, so with numbers off the title names the measure.
    readings.length > 1
      ? change
      : showNumbers.value
        ? formatBloodPressure(last.systolic, last.diastolic)
        : 'Blood pressure',
    stats,
    {
      points: readings.map((r) => ({ at: r.at, value: r.systolic })),
      secondary: {
        name: 'Diastolic',
        joined: true,
        points: readings.map((r) => ({ at: r.at, value: r.diastolic })),
      },
      unitLabel: 'mmHg',
      measure: 'Systolic',
      decimals: 0,
      guides: [],
    },
    'Blood pressure logged in PepCalc: systolic as a solid line, diastolic dashed.',
  )
}

function hrCard(): ShareCardContent | null {
  const readings = byTime(
    journal.vitals.flatMap((v) =>
      v.kind === 'hr' ? [{ at: toEpochMs(v.measuredAt), value: v.bpm }] : [],
    ),
  )
  const first = readings[0]
  const last = readings[readings.length - 1]
  if (!first || !last) return null
  const stats: [string, string][] = [['Since', formatDate(first.at)]]
  if (showNumbers.value) stats.push(['Latest', formatHeartRate(last.value)])
  stats.push(['Readings', String(readings.length)])
  return card(
    'Resting heart rate',
    readings.length > 1
      ? formatHeartRateChange(last.value - first.value)
      : showNumbers.value
        ? formatHeartRate(last.value)
        : 'Heart rate',
    stats,
    {
      points: readings,
      unitLabel: 'bpm',
      measure: 'Resting heart rate',
      decimals: 0,
      guides: [],
    },
    'Resting heart rate logged in PepCalc.',
  )
}

const content = computed<ShareCardContent | null>(() => {
  if (!open.value) return null
  switch (props.measure) {
    case 'bmi':
      return bmiCard()
    case 'a1c':
      return a1cCard()
    case 'glucose':
      return glucoseCard()
    case 'cgm':
      return cgmCard()
    case 'bp':
      return bpCard()
    case 'hr':
      return hrCard()
    default:
      return weightCard()
  }
})

const NAMES = {
  weight: 'weight',
  bmi: 'bmi',
  a1c: 'hba1c',
  glucose: 'glucose',
  cgm: 'glucose-monitor',
  bp: 'blood-pressure',
  hr: 'heart-rate',
} as const
</script>

<template>
  <ShareImageDialog
    v-model="open"
    title="Share as an image"
    :file-stem="`pepcalc-${NAMES[measure]}`"
    :content="content"
  >
    <v-switch
      v-model="showNumbers"
      :label="measure === 'weight' ? 'Show my weight' : 'Show my numbers'"
      hide-details
    />
    <p class="text-body-small pc-muted">
      {{
        showNumbers
          ? 'The image includes your values.'
          : measure === 'weight'
            ? 'Only the percent change is shown.'
            : 'Only the change is shown, without values.'
      }}
    </p>
    <template v-if="measure === 'weight' && photos?.length">
      <v-switch v-model="showPhotos" label="Include my photos" hide-details />
      <p v-if="showPhotos" class="text-body-small pc-muted">
        Anyone you share with can see your photos.
      </p>
    </template>
    <template v-if="canPeptides">
      <v-switch v-model="showDoses" label="Include my doses" hide-details />
      <v-switch
        v-if="canLevels"
        v-model="showLevels"
        label="Include estimated levels"
        hide-details
      />
      <template v-if="showDoses || showLevels">
        <v-switch v-model="showNames" label="Include peptide names" hide-details />
        <p class="text-body-small pc-muted">
          {{ showNames ? 'Names appear on the image.' : 'Shown as Peptide A, Peptide B.' }}
          <template v-if="(peptides?.length ?? 0) > SHARE_PEPTIDES">
            Shows the first {{ SHARE_PEPTIDES }} picked.
          </template>
        </p>
      </template>
    </template>
  </ShareImageDialog>
</template>
