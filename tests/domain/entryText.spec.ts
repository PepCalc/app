import { describe, expect, it } from 'vitest'
import { glucoseEntry, photoEntry, symptomEntry, vitalEntry, weightEntry } from '@/domain/entryText'

const AT = Date.UTC(2026, 10, 16, 8, 30)
const ISO = '2026-11-16T08:30:00.000Z'

describe('entryText', () => {
  it('formats a weight entry in kg and lb', () => {
    const row = { id: 'w1', measuredAt: ISO, kg: 82.4, notes: 'morning' }
    expect(weightEntry(row, 'kg', AT)).toEqual({
      id: 'w1',
      kind: 'weight',
      at: AT,
      title: '82.4 kg',
      detail: '',
      notes: 'morning',
    })
    expect(weightEntry(row, 'lb', AT)).toEqual({
      id: 'w1',
      kind: 'weight',
      at: AT,
      title: '181.7 lb',
      detail: '',
      notes: 'morning',
    })
  })

  it('formats an HbA1c entry in % and mmol/mol', () => {
    const row = {
      id: 'g1',
      kind: 'a1c' as const,
      measuredAt: ISO,
      value: 7.2,
      enteredUnit: '%' as const,
      context: null,
      notes: 'lab',
      createdAt: ISO,
    }
    expect(glucoseEntry(row, { glucose: 'mg/dL', a1c: '%' }, AT)).toMatchObject({
      id: 'g1',
      kind: 'glucose',
      at: AT,
      title: 'HbA1c 7.2%',
      detail: '',
      notes: 'lab',
    })
    expect(glucoseEntry(row, { glucose: 'mg/dL', a1c: 'mmol/mol' }, AT)).toMatchObject({
      title: 'HbA1c 55 mmol/mol',
      detail: '',
      at: AT,
    })
  })

  it('formats a glucose reading with its context in mg/dL and mmol/L', () => {
    const row = {
      id: 'g2',
      kind: 'glucose' as const,
      measuredAt: ISO,
      value: 99,
      enteredUnit: 'mg/dL' as const,
      context: 'fasting' as const,
      notes: '',
      createdAt: ISO,
    }
    expect(glucoseEntry(row, { glucose: 'mg/dL', a1c: '%' }, AT)).toMatchObject({
      id: 'g2',
      kind: 'glucose',
      at: AT,
      title: '99 mg/dL',
      detail: 'Fasting',
    })
    expect(glucoseEntry(row, { glucose: 'mmol/L', a1c: '%' }, AT)).toMatchObject({
      title: '5.5 mmol/L',
      detail: 'Fasting',
      at: AT,
    })
  })

  it('formats a glucose monitor day with its range in mg/dL and mmol/L', () => {
    const row = {
      id: 'g3',
      kind: 'daily' as const,
      measuredAt: ISO,
      value: 112.4,
      enteredUnit: 'mg/dL' as const,
      context: null,
      median: 108,
      min: 71,
      max: 183,
      count: 288,
      notes: '',
      createdAt: ISO,
    }
    expect(glucoseEntry(row, { glucose: 'mg/dL', a1c: '%' }, AT)).toMatchObject({
      id: 'g3',
      kind: 'glucose',
      at: AT,
      title: 'Average 112 mg/dL',
      detail: 'Glucose monitor · 71 to 183 mg/dL',
    })
    expect(glucoseEntry(row, { glucose: 'mmol/L', a1c: '%' }, AT)).toMatchObject({
      title: 'Average 6.2 mmol/L',
      detail: 'Glucose monitor · 3.9 to 10.2 mmol/L',
      at: AT,
    })
  })

  it('formats blood pressure and resting heart rate', () => {
    expect(
      vitalEntry(
        {
          id: 'v1',
          kind: 'bp',
          measuredAt: ISO,
          systolic: 128,
          diastolic: 82,
          notes: 'resting',
          createdAt: ISO,
        },
        AT,
      ),
    ).toEqual({
      id: 'v1',
      kind: 'vital',
      at: AT,
      title: '128/82 mmHg',
      detail: 'Blood pressure',
      notes: 'resting',
    })
    expect(
      vitalEntry(
        {
          id: 'v2',
          kind: 'hr',
          measuredAt: ISO,
          bpm: 64,
          notes: '',
          createdAt: ISO,
        },
        AT,
      ),
    ).toEqual({
      id: 'v2',
      kind: 'vital',
      at: AT,
      title: '64 bpm',
      detail: 'Resting heart rate',
      notes: '',
    })
  })

  it('formats listed and custom side effects', () => {
    expect(
      symptomEntry(
        {
          id: 's1',
          occurredAt: ISO,
          symptom: 'nausea',
          otherText: '',
          severity: 'mild',
          notes: 'after dinner',
          createdAt: ISO,
        },
        AT,
      ),
    ).toEqual({
      id: 's1',
      kind: 'symptom',
      at: AT,
      title: 'Nausea',
      detail: 'Mild',
      notes: 'after dinner',
    })
    expect(
      symptomEntry(
        {
          id: 's2',
          occurredAt: ISO,
          symptom: 'other',
          otherText: 'Dry mouth',
          severity: 'moderate',
          notes: '',
          createdAt: ISO,
        },
        AT,
      ),
    ).toEqual({
      id: 's2',
      kind: 'symptom',
      at: AT,
      title: 'Dry mouth',
      detail: 'Moderate',
      notes: '',
    })
  })

  it('formats a progress photo by pose', () => {
    expect(photoEntry({ id: 'p1', pose: 'front', notes: 'week 4' }, AT)).toEqual({
      id: 'p1',
      kind: 'photo',
      at: AT,
      title: 'Front photo',
      detail: '',
      notes: 'week 4',
    })
    expect(photoEntry({ id: 'p2', pose: 'side', notes: '' }, AT)).toMatchObject({
      title: 'Side photo',
      detail: '',
      at: AT,
    })
  })
})
