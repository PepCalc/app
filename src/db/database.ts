import Dexie, { type EntityTable } from 'dexie'
import { toPlain } from './plain'
import type { BlendComponent } from '@/domain/blend'
import type { BodyMetric, MeasureUnit } from '@/domain/body'
import type { A1cUnit, GlucoseContext, GlucoseUnit } from '@/domain/glucose'
import type { PhotoPose } from '@/domain/photos'
import type { PkParameters } from '@/domain/pk'
import type { Severity, Symptom } from '@/domain/symptoms'
import type { Course, Schedule } from '@/domain/schedule'
import type { InjectionSite, SiteMode } from '@/domain/sites'
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
  /** Where an injection went, for rotation; null when not recorded. */
  site: InjectionSite | null
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
  schedule: Schedule
  /** What the user plans to take each time; null when they have not said. Never from the catalog. */
  plannedDose: Quantity | null
  course: Course | null
  /** Preferred injection site (or starting site when rotating); null when not set. */
  site: InjectionSite | null
  /** Whether to rotate through sites or stay fixed on `site`; null when `site` is null. */
  siteMode: SiteMode | null
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
 * An HbA1c result, a glucose reading, or one day of a glucose monitor kept as its summary.
 * `value` is canonical and unrounded: HbA1c in NGSP percent, glucose in mg/dL, and for a
 * monitor day the day's average. A monitor day's `measuredAt` is the start of that local day.
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
  | {
      kind: 'daily'
      enteredUnit: 'mg/dL'
      context: null
      median: number
      min: number
      max: number
      /** How many readings the monitor took that day. */
      count: number
    }
)

/**
 * A blood pressure or resting heart rate reading, as the cuff or monitor showed it: mmHg for
 * blood pressure, beats per minute for heart rate.
 */
export type VitalRow = {
  id: string
  measuredAt: string
  notes: string
  createdAt: string
} & ({ kind: 'bp'; systolic: number; diastolic: number } | { kind: 'hr'; bpm: number })

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
  vitals: EntityTable<VitalRow, 'id'>
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
  // Blood pressure and heart rate: a new table only, so existing rows need no upgrade.
  db.version(4).stores({
    vitals: 'id, kind, measuredAt',
  })
  // Schedules gain kinds: an interval becomes one kind of schedule. No index changes.
  db.version(5).upgrade((tx) =>
    tx
      .table('protocols')
      .toCollection()
      .modify((row) => {
        const hours = row.intervalHours
        row.schedule =
          typeof hours === 'number' && Number.isFinite(hours) && hours > 0 && hours <= 8760
            ? { kind: 'interval', everyHours: hours }
            : { kind: 'asNeeded' }
        row.plannedDose = null
        row.course = null
        delete row.intervalHours
      }),
  )
  // Protocols and draws gain optional injection site tracking. No index changes.
  db.version(6).upgrade(async (tx) => {
    await tx
      .table('protocols')
      .toCollection()
      .modify((row) => {
        row.site ??= null
        row.siteMode ??= null
      })
    await tx
      .table('draws')
      .toCollection()
      .modify((row) => {
        row.site ??= null
      })
  })
  /*
   * Rows reach IndexedDB as plain data. Stores hold reactive state, and a reactive proxy passed
   * to a write would fail the whole write with DataCloneError; copying here covers every table
   * and every repository method, present and future.
   */
  db.use({
    stack: 'dbcore',
    name: 'plainWrites',
    create: (core) => ({
      ...core,
      table(name) {
        const table = core.table(name)
        return {
          ...table,
          mutate: (request) =>
            table.mutate(
              request.type === 'add' || request.type === 'put'
                ? { ...request, values: request.values.map(toPlain) }
                : request,
            ),
        }
      },
    }),
  })
  return db
}

export const db = createDatabase()
