import type { GlucoseRow, SymptomRow, VitalRow } from '@/db/database'
import { formatWeight, type WeightUnit } from './bodyUnits'
import type { Entry } from './entries'
import {
  formatA1c,
  formatGlucose,
  formatGlucoseRange,
  GLUCOSE_CONTEXT_LABELS,
  type A1cUnit,
  type GlucoseUnit,
} from './glucose'
import { POSE_LABELS, type PhotoPose } from './photos'
import { SEVERITY_LABELS, symptomName } from './symptoms'
import { formatBloodPressure, formatHeartRate } from './vitals'

/** Format a weigh-in row into a timeline entry in the user's display unit. */
export function weightEntry(
  row: { id: string; measuredAt: string; kg: number; notes: string },
  unit: WeightUnit,
  at: number,
): Entry {
  return {
    id: row.id,
    kind: 'weight',
    at,
    title: formatWeight(row.kg, unit),
    detail: '',
    notes: row.notes,
  }
}

/** Format an HbA1c, glucose or monitor-day row into a timeline entry in display units. */
export function glucoseEntry(
  row: GlucoseRow,
  units: { glucose: GlucoseUnit; a1c: A1cUnit },
  at: number,
): Entry {
  if (row.kind === 'a1c') {
    return {
      id: row.id,
      kind: 'glucose',
      at,
      title: `HbA1c ${formatA1c(row.value, units.a1c)}`,
      detail: '',
      notes: row.notes,
    }
  }
  if (row.kind === 'daily') {
    return {
      id: row.id,
      kind: 'glucose',
      at,
      title: `Average ${formatGlucose(row.value, units.glucose)}`,
      detail: `Glucose monitor · ${formatGlucoseRange(row.min, row.max, units.glucose)}`,
      notes: row.notes,
    }
  }
  return {
    id: row.id,
    kind: 'glucose',
    at,
    title: formatGlucose(row.value, units.glucose),
    detail: GLUCOSE_CONTEXT_LABELS[row.context],
    notes: row.notes,
  }
}

/** Format a blood pressure or resting heart rate row into a timeline entry. */
export function vitalEntry(row: VitalRow, at: number): Entry {
  return {
    id: row.id,
    kind: 'vital',
    at,
    title:
      row.kind === 'bp'
        ? formatBloodPressure(row.systolic, row.diastolic)
        : formatHeartRate(row.bpm),
    detail: row.kind === 'bp' ? 'Blood pressure' : 'Resting heart rate',
    notes: row.notes,
  }
}

/** Format a side-effect row into a timeline entry. */
export function symptomEntry(row: SymptomRow, at: number): Entry {
  return {
    id: row.id,
    kind: 'symptom',
    at,
    title: symptomName(row),
    detail: SEVERITY_LABELS[row.severity],
    notes: row.notes,
  }
}

/** Format a progress photo row into a timeline entry. */
export function photoEntry(row: { id: string; pose: PhotoPose; notes: string }, at: number): Entry {
  return {
    id: row.id,
    kind: 'photo',
    at,
    title: `${POSE_LABELS[row.pose]} photo`,
    detail: '',
    notes: row.notes,
  }
}
