import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { EntryKind } from '@/domain/entries'
import type { LogTarget } from '@/stores/log'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { toIso } from '@/services/time'
import {
  mdiCameraOutline,
  mdiHeartPulse,
  mdiScaleBathroom,
  mdiStethoscope,
  mdiWaterOutline,
} from '@/plugins/icons'
import LogWeightDialog from '@/components/journal/LogWeightDialog.vue'
import LogSymptomDialog from '@/components/journal/LogSymptomDialog.vue'
import LogGlucoseDialog from '@/components/journal/LogGlucoseDialog.vue'
import LogVitalsDialog from '@/components/journal/LogVitalsDialog.vue'
import PhotoDialog from '@/components/photos/PhotoDialog.vue'

export interface LogKind {
  kind: EntryKind
  /** The sheet's row and the filter chip: "Draw", "Weight". */
  title: string
  /** Plural for the filter chip and empty states: "Draws". */
  plural: string
  icon: string
  /** Optional reason a new entry cannot start right now, with an optional route to fix it. */
  disabled?: () => { hint: string; to?: RouteLocationRaw } | null
  /** The dialog and the props it takes for a target; null means an edit target is missing. */
  dialog: Component
  props: (target: LogTarget | null) => Record<string, unknown> | null
}

function emptyProps(kind: EntryKind): Record<string, unknown> {
  switch (kind) {
    case 'dose':
      return {}
    case 'weight':
      return { weight: null }
    case 'symptom':
      return { symptom: null }
    case 'glucose':
      return { reading: null }
    case 'vital':
      return { reading: null }
    case 'photo':
      return { photo: null, prepared: null, takenAt: '' }
  }
}

export const LOG_KINDS: readonly LogKind[] = [
  {
    kind: 'weight',
    title: 'Weight',
    plural: 'Weight',
    icon: mdiScaleBathroom,
    dialog: LogWeightDialog,
    props: (target) => {
      if (!target) return emptyProps('weight')
      const journal = useJournalStore()
      if (target.id === null) return { weight: null, startAt: target.context.at }
      const weight = journal.weights.find((w) => w.id === target.id)
      return weight ? { weight } : null
    },
  },
  {
    kind: 'symptom',
    title: 'Side effect',
    plural: 'Side effects',
    icon: mdiStethoscope,
    dialog: LogSymptomDialog,
    props: (target) => {
      if (!target) return emptyProps('symptom')
      const journal = useJournalStore()
      if (target.id === null) return { symptom: null, startAt: target.context.at }
      const symptom = journal.symptoms.find((s) => s.id === target.id)
      return symptom ? { symptom } : null
    },
  },
  {
    kind: 'glucose',
    title: 'Blood sugar',
    plural: 'Blood sugar',
    icon: mdiWaterOutline,
    dialog: LogGlucoseDialog,
    props: (target) => {
      if (!target) return emptyProps('glucose')
      const journal = useJournalStore()
      if (target.id === null) return { reading: null, startAt: target.context.at }
      const reading = journal.glucose.find((g) => g.id === target.id)
      return reading ? { reading } : null
    },
  },
  {
    kind: 'vital',
    title: 'Vitals',
    plural: 'Vitals',
    icon: mdiHeartPulse,
    dialog: LogVitalsDialog,
    props: (target) => {
      if (!target) return emptyProps('vital')
      const journal = useJournalStore()
      if (target.id === null) return { reading: null, startAt: target.context.at }
      const reading = journal.vitals.find((v) => v.id === target.id)
      return reading ? { reading } : null
    },
  },
  {
    kind: 'photo',
    title: 'Photo',
    plural: 'Photos',
    icon: mdiCameraOutline,
    dialog: PhotoDialog,
    props: (target) => {
      if (!target) return emptyProps('photo')
      const photos = usePhotosStore()
      if (target.id === null) {
        const takenAt =
          target.context.takenAt ??
          (target.context.at !== undefined ? toIso(target.context.at) : '')
        return { photo: null, prepared: target.context.prepared ?? null, takenAt }
      }
      const photo = photos.photos.find((p) => p.id === target.id)
      return photo ? { photo, prepared: null, takenAt: photo.takenAt } : null
    },
  },
]
