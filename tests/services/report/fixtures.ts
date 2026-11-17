import { findPeptide } from '@/data'
import type { DrawRow, GlucoseRow, SymptomRow, VialRow, VitalRow } from '@/db/database'
import { groupLevelsByPeptide, type LevelVial } from '@/domain/levels'
import type { ReportPeriod } from '@/domain/report'
import type { ReportSource } from '@/services/report/collectReport'
import { REPORT_SECTIONS } from '@/services/report/reportData'

const DAY = 86_400_000
export const NOW = Date.parse('2026-10-29T12:00:00.000Z')

function vial(
  id: string,
  peptideId: string | null,
  name: string,
  extra: Partial<VialRow> = {},
): VialRow {
  return {
    id,
    peptideId,
    name,
    kind: 'single',
    unit: 'mg',
    amount: 5,
    diluentMl: 2,
    components: null,
    typicalDose: null,
    pkOverride: null,
    reconstitutedAt: null,
    status: 'active',
    notes: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...extra,
  }
}

let seq = 0
function draw(
  vialId: string,
  at: number,
  value: number,
  unit: 'mg' | 'mcg' | 'iu',
  notes = '',
): DrawRow {
  const iso = new Date(at).toISOString()
  return {
    id: `d${seq++}`,
    vialId,
    takenAt: iso,
    dose: { value, unit },
    volumeMl: 0.1,
    syringeId: 'u100-1ml',
    site: null,
    notes,
    createdAt: iso,
  }
}

/** A plausible shelf: weekly semaglutide with a step-up, daily BPC-157, and a custom vial. */
export function sampleShelf() {
  const vials = [
    vial('sema', 'semaglutide', 'Semaglutide'),
    vial('bpc', 'bpc-157', 'BPC-157'),
    vial('custom', null, 'Lab peptide (batch 7) x) Tj /F1 99 Tf (y', {
      pkOverride: { halfLifeHours: 30, tmaxHours: 3 },
    }),
  ]
  const draws: DrawRow[] = []
  for (let w = 0; w < 12; w++) {
    draws.push(
      draw(
        'sema',
        NOW - (80 - w * 7) * DAY,
        w < 4 ? 0.25 : 0.5,
        'mg',
        w === 4 ? 'Stepped up to 0.5 mg' : '',
      ),
    )
  }
  for (let d = 0; d < 20; d++) draws.push(draw('bpc', NOW - (20 - d) * DAY + 3600_000, 250, 'mcg'))
  draws.push(draw('custom', NOW - 2 * DAY, 2, 'mg', 'Left thigh; note with émoji 💉 and ≥ sign'))
  return { vials, draws }
}

/** A hostile note: it tries to close the string and draw in a huge font. */
export const HOSTILE = 'fine) Tj /F1 99 Tf (pwned'

/** Weekly weigh-ins, two HbA1c results, glucose at mixed times, and a few side effects. */
export function sampleJournal() {
  const iso = (ms: number) => new Date(ms).toISOString()
  const created = iso(NOW - 200 * DAY)
  const weights = Array.from({ length: 12 }, (_, i) => ({
    measuredAt: iso(NOW - i * 7 * DAY),
    kg: 90 + i * 0.6,
  }))
  const symptoms: SymptomRow[] = [
    {
      id: 's1',
      occurredAt: iso(NOW - 3 * DAY),
      symptom: 'nausea',
      otherText: '',
      severity: 'moderate',
      notes: HOSTILE,
      createdAt: created,
    },
    {
      id: 's2',
      occurredAt: iso(NOW - 10 * DAY),
      symptom: 'nausea',
      otherText: '',
      severity: 'mild',
      notes: '',
      createdAt: created,
    },
    {
      id: 's3',
      occurredAt: iso(NOW - 5 * DAY),
      symptom: 'joint-pain',
      otherText: '',
      severity: 'mild',
      notes: '',
      createdAt: created,
    },
  ]
  const glucose: GlucoseRow[] = [
    {
      id: 'a1',
      kind: 'a1c',
      measuredAt: iso(NOW - 80 * DAY),
      value: 7.4,
      context: null,
      enteredUnit: '%',
      notes: HOSTILE,
      createdAt: created,
    },
    {
      id: 'a2',
      kind: 'a1c',
      measuredAt: iso(NOW - 5 * DAY),
      value: 6.6,
      context: null,
      enteredUnit: '%',
      notes: '',
      createdAt: created,
    },
    ...Array.from({ length: 8 }, (_, i): GlucoseRow => ({
      id: `g${i}`,
      kind: 'glucose',
      measuredAt: iso(NOW - i * 9 * DAY),
      value: 130 - i * 2 + (i % 2) * 40,
      context: i % 2 ? 'after-meal' : 'fasting',
      enteredUnit: 'mg/dL',
      notes: '',
      createdAt: created,
    })),
  ]
  glucose.push({
    id: 'day1',
    kind: 'daily',
    measuredAt: iso(NOW - 6 * DAY),
    value: 112.4,
    enteredUnit: 'mg/dL',
    context: null,
    median: 108,
    min: 71,
    max: 183,
    count: 288,
    notes: '',
    createdAt: created,
  })
  const vitals: VitalRow[] = [
    {
      id: 'bp1',
      kind: 'bp',
      systolic: 134,
      diastolic: 86,
      measuredAt: iso(NOW - 20 * DAY),
      notes: '',
      createdAt: created,
    },
    {
      id: 'bp2',
      kind: 'bp',
      systolic: 126,
      diastolic: 81,
      measuredAt: iso(NOW - 4 * DAY),
      notes: '',
      createdAt: created,
    },
    {
      id: 'hr1',
      kind: 'hr',
      bpm: 66,
      measuredAt: iso(NOW - 4 * DAY),
      notes: '',
      createdAt: created,
    },
  ]
  return { weights, symptoms, glucose, vitals }
}

export function sampleSource(
  period: ReportPeriod = '90d',
  region: string | null = 'GB',
): ReportSource {
  const { vials, draws } = sampleShelf()
  const levelVials: LevelVial[] = vials.map((v) => ({
    id: v.id,
    peptideId: v.peptideId,
    label: findPeptide(v.peptideId)?.name ?? v.name,
    pk: v.pkOverride
      ? { params: v.pkOverride, userSupplied: true }
      : findPeptide(v.peptideId)?.pk
        ? { params: findPeptide(v.peptideId)!.pk!, userSupplied: false }
        : null,
  }))
  const groups = groupLevelsByPeptide(
    levelVials,
    draws.map((d) => ({ vialId: d.vialId, at: Date.parse(d.takenAt), dose: d.dose })),
  )
  return {
    vials,
    draws,
    groups,
    vialName: (v) => v.name,
    ...sampleJournal(),
    units: { weight: 'kg', a1c: '%', glucose: 'mg/dL' },
    profile: { heightCm: 175 },
    sections: REPORT_SECTIONS,
    period,
    now: NOW,
    region,
  }
}
