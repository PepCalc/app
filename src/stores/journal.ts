import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repository } from '@/db'
import type { GlucoseRow, MeasurementRow, SymptomRow, VitalRow } from '@/db/database'
import type { NewGlucose, NewMeasurement, NewSymptom, NewVital } from '@/db/repository'
import { weightChange, type BodyMetric, type WeightChange } from '@/domain/body'
import type { WeightUnit } from '@/domain/bodyUnits'
import { toEpochMs } from '@/services/time'

/** A weigh-in: a weight measurement read in kilograms, as the weight screens and charts use it. */
export interface WeightEntry {
  id: string
  measuredAt: string
  kg: number
  enteredUnit: WeightUnit
  notes: string
  createdAt: string
}

export type NewWeight = Pick<WeightEntry, 'measuredAt' | 'kg' | 'enteredUnit' | 'notes'>

const toWeight = (m: MeasurementRow): WeightEntry => ({
  id: m.id,
  measuredAt: m.measuredAt,
  kg: m.value,
  enteredUnit: m.enteredUnit as WeightUnit,
  notes: m.notes,
  createdAt: m.createdAt,
})

const toMeasurement = (w: Partial<NewWeight>): Partial<NewMeasurement> => ({
  ...(w.kg !== undefined && { value: w.kg }),
  ...(w.enteredUnit !== undefined && { enteredUnit: w.enteredUnit }),
  ...(w.measuredAt !== undefined && { measuredAt: w.measuredAt }),
  ...(w.notes !== undefined && { notes: w.notes }),
})

/**
 * The journal: body measurements, side effects, blood sugar and vitals. Photos have their own store, as
 * their thumbnails are object URLs. The whole dataset is small enough to hold in memory, so the
 * store loads everything once and reloads after each write.
 */
export const useJournalStore = defineStore('journal', () => {
  /** Every metric, newest first. */
  const measurements = ref<MeasurementRow[]>([])
  /** Newest first. */
  const symptoms = ref<SymptomRow[]>([])
  /** HbA1c results and glucose readings, newest first. */
  const glucose = ref<GlucoseRow[]>([])
  /** Blood pressure and resting heart rate readings, newest first. */
  const vitals = ref<VitalRow[]>([])
  const loaded = ref(false)

  async function load() {
    const [m, s, g, v] = await Promise.all([
      repository.listMeasurements(),
      repository.listSymptoms(),
      repository.listGlucose(),
      repository.listVitals(),
    ])
    measurements.value = m
    symptoms.value = s
    glucose.value = g
    vitals.value = v
    loaded.value = true
  }

  /** One metric's measurements, newest first: the seam a body-composition chart reads from. */
  function measurementsOf(metric: BodyMetric): MeasurementRow[] {
    return measurements.value.filter((m) => m.metric === metric)
  }

  /** Weigh-ins, newest first. */
  const weights = computed<WeightEntry[]>(() => measurementsOf('weight').map(toWeight))
  const latestWeight = computed<WeightEntry | undefined>(() => weights.value[0])

  /** From the first weigh-in to the latest (see weightChange). */
  const change = computed<WeightChange | null>(() =>
    weightChange(weights.value.map((w) => ({ at: toEpochMs(w.measuredAt), kg: w.kg }))),
  )

  async function addWeight(input: NewWeight): Promise<WeightEntry> {
    const [row] = await repository.addMeasurements([
      { metric: 'weight', ...(toMeasurement(input) as Omit<NewMeasurement, 'metric'>) },
    ])
    await load()
    return toWeight(row!)
  }

  async function updateWeight(id: string, changes: Partial<NewWeight>) {
    await repository.updateMeasurement(id, toMeasurement(changes))
    await load()
  }

  async function deleteWeight(id: string) {
    await repository.deleteMeasurement(id)
    await load()
  }

  async function addSymptoms(inputs: NewSymptom[]): Promise<SymptomRow[]> {
    const rows = await repository.addSymptoms(inputs)
    await load()
    return rows
  }

  async function updateSymptom(id: string, changes: Partial<NewSymptom>) {
    await repository.updateSymptom(id, changes)
    await load()
  }

  async function deleteSymptom(id: string) {
    await repository.deleteSymptom(id)
    await load()
  }

  async function addGlucose(input: NewGlucose): Promise<GlucoseRow> {
    const row = await repository.addGlucose(input)
    await load()
    return row
  }

  async function updateGlucose(id: string, changes: NewGlucose) {
    await repository.updateGlucose(id, changes)
    await load()
  }

  async function deleteGlucose(id: string) {
    await repository.deleteGlucose(id)
    await load()
  }

  async function addVital(input: NewVital): Promise<VitalRow> {
    const row = await repository.addVital(input)
    await load()
    return row
  }

  async function updateVital(id: string, changes: NewVital) {
    await repository.updateVital(id, changes)
    await load()
  }

  async function deleteVital(id: string) {
    await repository.deleteVital(id)
    await load()
  }

  return {
    measurements,
    symptoms,
    glucose,
    vitals,
    loaded,
    weights,
    latestWeight,
    change,
    load,
    measurementsOf,
    addWeight,
    updateWeight,
    deleteWeight,
    addSymptoms,
    updateSymptom,
    deleteSymptom,
    addGlucose,
    updateGlucose,
    deleteGlucose,
    addVital,
    updateVital,
    deleteVital,
  }
})
