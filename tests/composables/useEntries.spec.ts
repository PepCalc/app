import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repository } from '@/db'
import { useEntries } from '@/composables/useEntries'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'

describe('useEntries', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T08:00:00.000Z'))
    setActivePinia(createPinia())
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('combines draws and journal entries newest first, numbering twin vials', async () => {
    await repository.setSetting('disclaimerAcceptedAt', '2026-10-01T00:00:00.000Z')
    await repository.setSetting('weightUnit', 'kg')
    await repository.setSetting('glucoseUnit', 'mg/dL')
    await repository.setSetting('a1cUnit', '%')

    const baseVial = {
      peptideId: 'bpc-157',
      name: 'BPC-157',
      kind: 'single' as const,
      unit: 'mg' as const,
      amount: 5,
      diluentMl: 2,
      components: null,
      typicalDose: { value: 250, unit: 'mcg' as const },
      pkOverride: null,
      reconstitutedAt: '2026-11-01T08:00:00.000Z',
      status: 'active' as const,
      notes: '',
    }
    await repository.addVial(baseVial)
    vi.advanceTimersByTime(1000)
    const secondVial = await repository.addVial(baseVial)
    await repository.addDraw({
      vialId: secondVial.id,
      takenAt: '2026-11-16T08:10:00.000Z',
      dose: { value: 250, unit: 'mcg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await repository.addMeasurements([
      {
        metric: 'weight',
        measuredAt: '2026-11-16T07:55:00.000Z',
        value: 82.4,
        enteredUnit: 'kg',
        notes: '',
      },
    ])
    await repository.addSymptoms([
      {
        occurredAt: '2026-11-15T19:30:00.000Z',
        symptom: 'nausea',
        otherText: '',
        severity: 'mild',
        notes: '',
      },
    ])
    await repository.addGlucose({
      kind: 'glucose',
      measuredAt: '2026-11-15T08:00:00.000Z',
      value: 96,
      enteredUnit: 'mg/dL',
      context: 'fasting',
      notes: '',
    })
    await repository.addVital({
      kind: 'bp',
      measuredAt: '2026-11-14T09:00:00.000Z',
      systolic: 124,
      diastolic: 78,
      notes: '',
    })
    await repository.addPhoto(
      {
        takenAt: '2026-11-13T10:00:00.000Z',
        pose: 'front',
        notes: '',
        width: 300,
        height: 400,
      },
      new Uint8Array([1, 2]).buffer,
      new Uint8Array([3, 4]).buffer,
    )

    await Promise.all([
      useSettingsStore().load(),
      useShelfStore().load(),
      useJournalStore().load(),
      usePhotosStore().load(),
    ])
    const { entries } = useEntries()

    expect(entries.value).toHaveLength(6)
    expect(entries.value.map((e) => e.kind)).toEqual([
      'dose',
      'weight',
      'symptom',
      'glucose',
      'vital',
      'photo',
    ])
    expect(entries.value.map((e) => e.title)).toEqual([
      '250 mcg BPC-157 #2',
      '82.4 kg',
      'Nausea',
      '96 mg/dL',
      '124/78 mmHg',
      'Front photo',
    ])
    expect(entries.value[0]!.detail).toBe('10 units')
  })
})
