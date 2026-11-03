import Dexie, { type EntityTable } from 'dexie'
import type { BlendComponent } from '@/domain/blend'
import type { BodyMetric, MeasureUnit } from '@/domain/body'
import type { A1cUnit, GlucoseContext, GlucoseUnit } from '@/domain/glucose'
import type { PhotoPose } from '@/domain/photos'
import type { PkParameters } from '@/domain/pk'
import type { Severity, Symptom } from '@/domain/symptoms'
import type { AmountUnit, Quantity } from '@/domain/units'

/** A reconstituted (or still dry) vial on the user's shelf. Timestamps are UTC ISO-8601. */
export interface VialRow {
  id: string
  /** Catalog id, or null for a custom peptide. */
  peptideId: string | null
  name: string
  kind: 'single' | 'blend'
  unit: AmountUnit
  amount: number
  diluentMl: number
  components: BlendComponent[] | null
  typicalDose: Quantity | null
  /** User-supplied PK parameters; overrides the catalog and enables a curve without catalog PK. */
  pkOverride: PkParameters | null
  reconstitutedAt: string | null
  status: 'active' | 'archived'
  notes: string
  createdAt: string
  updatedAt: string
}

export interface DrawRow {
  id: string
  vialId: string
  takenAt: string
  dose: Quantity
  volumeMl: number
  syringeId: string
  notes: string
  createdAt: string
}

/**
 * The user's own schedule for one peptide, so the app can show when the next dose is due. It
 * belongs to the peptide, not a vial: every vial of it counts, so a fresh vial carries on.
 */
export interface ProtocolRow {
  id: string
  /** The peptide's `sameProductKey`: a catalog id, or `name:<custom name>`. */
  key: string
  /** The peptide's name when the protocol was made, shown if no vial matches any more. */
  name: string
  /** Hours between doses: 12 for twice daily, 24 daily, 168 weekly. */
  intervalHours: number
  notes: string
  createdAt: string
  updatedAt: string
}

/**
 * One body measure at one time: a weigh-in today, and body fat or a waist later, without a
 * schema change (see `METRICS`). `value` is in the metric's canonical unit (kg, cm, percent),
 * unrounded, so switching units never compounds rounding.
 */
export interface MeasurementRow {
  id: string
  metric: BodyMetric
  measuredAt: string
  value: number
  /** The unit the user typed, so an edit shows the number they entered. */
  enteredUnit: MeasureUnit
  notes: string
  createdAt: string
}

/** A side effect the user felt, for their own record. */
export interface SymptomRow {
  id: string
  occurredAt: string
  symptom: Symptom
  /** The user's words when `symptom` is `other`; empty otherwise. */
  otherText: string
  severity: Severity
  notes: string
  createdAt: string
}

/**
 * An HbA1c result or a glucose reading. `value` is canonical and unrounded: HbA1c in NGSP
 * percent, glucose in mg/dL.
 */
export type GlucoseRow = {
  id: string
  measuredAt: string
  value: number
  notes: string
  createdAt: string
} & (
  | { kind: 'a1c'; enteredUnit: A1cUnit; context: null }
  | { kind: 'glucose'; enteredUnit: GlucoseUnit; context: GlucoseContext }
)

/** A progress photo's details. Its pixels live in `photoImages` and `photoThumbs`, by id. */
export interface PhotoRow {
  id: string
  takenAt: string
  pose: PhotoPose
  notes: string
  /** Pixel size of the stored image, for laying out before it loads. */
  width: number
  height: number
  createdAt: string
}

/**
 * A photo's JPEG bytes. Stored as an ArrayBuffer, not a Blob: older Safari and some IndexedDB
 * implementations cannot store Blobs. Thumbnails sit in their own table so a grid of them never
 * reads the full images.
 */
export interface PhotoBytesRow {
  id: string
  bytes: ArrayBuffer
}

export interface SettingRow {
  key: string
  value: unknown
}

export type PepcalcDb = Dexie & {
  vials: EntityTable<VialRow, 'id'>
  draws: EntityTable<DrawRow, 'id'>
  protocols: EntityTable<ProtocolRow, 'id'>
  measurements: EntityTable<MeasurementRow, 'id'>
  symptoms: EntityTable<SymptomRow, 'id'>
  glucose: EntityTable<GlucoseRow, 'id'>
  photos: EntityTable<PhotoRow, 'id'>
  photoImages: EntityTable<PhotoBytesRow, 'id'>
  photoThumbs: EntityTable<PhotoBytesRow, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

const DB_NAME = 'pepcalc'

/*
 * Schema history. Never edit a released version: add a new `db.version(n + 1)` with an
 * `.upgrade()` that migrates existing rows, because users' only copy of their data is here.
 * Indexes list only fields that are queried; other fields are stored but not indexed.
 */
export function createDatabase(name = DB_NAME): PepcalcDb {
  const db = new Dexie(name) as PepcalcDb
  db.version(1).stores({
    vials: 'id, status, peptideId, createdAt',
    draws: 'id, vialId, takenAt, [vialId+takenAt]',
    settings: 'key',
  })
  // The journal: body measurements, side effects, blood sugar and progress photos. New tables
  // only, so existing rows need no upgrade.
  db.version(2).stores({
    measurements: 'id, measuredAt, [metric+measuredAt]',
    symptoms: 'id, occurredAt',
    glucose: 'id, kind, measuredAt',
    photos: 'id, takenAt',
    photoImages: 'id',
    photoThumbs: 'id',
  })
  // Protocols: a new table only, so existing rows need no upgrade.
  db.version(3).stores({
    protocols: 'id, key',
  })
  return db
}

export const db = createDatabase()
