import { computed, type ComputedRef } from 'vue'
import { findSyringe } from '@/data'
import type { DrawRow } from '@/db/database'
import type { Entry } from '@/domain/entries'
import { glucoseEntry, photoEntry, symptomEntry, vitalEntry, weightEntry } from '@/domain/entryText'
import { sortByTime } from '@/domain/listing'
import { readSyringe } from '@/domain/syringe'
import { SITE_LABELS } from '@/domain/sites'
import { formatQuantity, roundTo } from '@/domain/units'
import { toEpochMs } from '@/services/time'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'

function drawDetail(d: DrawRow): string {
  const r = readSyringe(d.volumeMl, findSyringe(d.syringeId))
  const syringe =
    r.scaleUnit === 'units' ? `${roundTo(r.scaleValue, 2)} units` : `${roundTo(r.scaleValue, 3)} mL`
  return d.site ? `${syringe} · ${SITE_LABELS[d.site]}` : syringe
}

/** Every logged thing as timeline entries, newest first, formatted in the active display units. */
export function useEntries(): { entries: ComputedRef<Entry[]> } {
  const shelf = useShelfStore()
  const journal = useJournalStore()
  const photos = usePhotosStore()
  const settings = useSettingsStore()

  const entries = computed<Entry[]>(() => {
    const drawEntries: Entry[] = shelf.draws.map((d) => {
      const vial = shelf.vialById(d.vialId)
      const vialName = vial ? shelf.displayName(vial) : 'Deleted vial'
      return {
        id: d.id,
        kind: 'dose',
        at: toEpochMs(d.takenAt),
        title: `${formatQuantity(d.dose)} ${vialName}`,
        detail: drawDetail(d),
        notes: d.notes,
      }
    })
    const weightEntries = journal.weights.map((w) =>
      weightEntry(w, settings.weightUnit, toEpochMs(w.measuredAt)),
    )
    const symptomEntries = journal.symptoms.map((s) => symptomEntry(s, toEpochMs(s.occurredAt)))
    const glucoseEntries = journal.glucose.map((g) =>
      glucoseEntry(
        g,
        { glucose: settings.glucoseUnit, a1c: settings.a1cUnit },
        toEpochMs(g.measuredAt),
      ),
    )
    const vitalEntries = journal.vitals.map((v) => vitalEntry(v, toEpochMs(v.measuredAt)))
    const photoEntries = photos.photos.map((p) => photoEntry(p, toEpochMs(p.takenAt)))

    return sortByTime(
      [
        ...drawEntries,
        ...weightEntries,
        ...symptomEntries,
        ...glucoseEntries,
        ...vitalEntries,
        ...photoEntries,
      ],
      (e) => e.at,
      'desc',
    )
  })

  return { entries }
}
