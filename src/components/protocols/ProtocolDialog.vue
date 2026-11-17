<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { findPeptide } from '@/data'
import type { ProtocolRow } from '@/db/database'
import { toPlain } from '@/db/plain'
import type { NewProtocol } from '@/db/repository'
import {
  isValidCalendarDate,
  isValidCourse,
  lastDrawFor,
  projectedDoseTimes,
  scheduleText,
  type Course,
  type Schedule,
} from '@/domain/schedule'
import { INJECTION_SITES, SITE_LABELS, type InjectionSite, type SiteMode } from '@/domain/sites'
import {
  areCompatible,
  convert,
  doseUnitsFor,
  unitLabel,
  type AmountUnit,
  type Quantity,
} from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { fileDate, formatTimeOfDay, localCalendar, toEpochMs, weekdayName } from '@/services/time'
import { useProtocolsStore, type ProtocolProduct } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import ProjectionPanel from '@/components/charts/ProjectionPanel.vue'
import ScheduleEditor from './ScheduleEditor.vue'

/**
 * Add or edit a protocol: which peptide, the user's own schedule, optional planned dose and
 * optional course length. Nothing is pre-filled from the catalog, so every figure stays the
 * user's own and never reads as a suggestion.
 */
const props = defineProps<{
  /** The protocol being edited, or null to add one. */
  protocol: ProtocolRow | null
  /** Peptides on the shelf that can get a new protocol. */
  products: ProtocolProduct[]
  /** The edited protocol's peptide name. */
  name?: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ save: [input: NewProtocol]; delete: [protocol: ProtocolRow] }>()

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const now = useNow()

interface Form {
  key: string | null
  schedule: Schedule
  plannedDose: string
  plannedDoseUnit: AmountUnit
  courseWeeks: string
  courseStartOn: string
  site: InjectionSite | null
  siteMode: SiteMode
  notes: string
}

const form = reactive<Form>({
  key: null,
  schedule: { kind: 'weekly', days: [], times: [{ hour: 8, minute: 0 }] },
  plannedDose: '',
  plannedDoseUnit: 'mg',
  courseWeeks: '',
  courseStartOn: '',
  site: null,
  siteMode: 'rotate',
  notes: '',
})

const scheduleValid = ref(true)

const levels = computed(() => (form.key ? protocols.levelsOf(form.key) : null))
const doseUnits = computed<AmountUnit[]>(() => {
  const key = form.key
  if (!key) return ['mg', 'mcg']
  const vial = shelf.vialsOf(key)[0]
  const unit = vial?.unit ?? findPeptide(key)?.vialUnit ?? 'mg'
  return doseUnitsFor(unit)
})

// Reset from the protocol each time the dialog opens, discarding abandoned edits.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const p = props.protocol
    const key = p?.key ?? (props.products.length === 1 ? props.products[0]!.key : null)
    const defaultUnit =
      p?.plannedDose?.unit ??
      (key ? protocols.levelsOf(key)?.unit : undefined) ??
      (key
        ? doseUnitsFor(shelf.vialsOf(key)[0]?.unit ?? findPeptide(key)?.vialUnit ?? 'mg')[0]!
        : 'mg')
    Object.assign(form, {
      key,
      schedule: p
        ? toPlain(p.schedule)
        : { kind: 'weekly', days: [], times: [{ hour: 8, minute: 0 }] },
      plannedDose: p?.plannedDose ? String(p.plannedDose.value) : '',
      plannedDoseUnit: defaultUnit,
      courseWeeks: p?.course ? String(p.course.weeks) : '',
      courseStartOn: p?.course?.startOn ?? fileDate(now.value),
      site: p?.site ?? null,
      siteMode: p?.siteMode ?? 'rotate',
      notes: p?.notes ?? '',
    } satisfies Form)
  },
  { immediate: true },
)

watch(doseUnits, (units) => {
  if (!units.includes(form.plannedDoseUnit)) form.plannedDoseUnit = units[0]!
})

const parsedPlannedDose = computed<{ dose: Quantity | null; error?: string }>(() => {
  const raw = form.plannedDose.trim()
  if (!raw) return { dose: null }
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return { dose: null, error: 'Enter a number greater than 0' }
  }
  return { dose: { value, unit: form.plannedDoseUnit } }
})

const parsedCourse = computed<{ course: Course | null; weeksError?: string; dateError?: string }>(
  () => {
    const raw = form.courseWeeks.trim()
    if (!raw) return { course: null }
    const weeks = Number(raw)
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
      return { course: null, weeksError: 'Enter 1 to 104 weeks' }
    }
    if (!isValidCalendarDate(form.courseStartOn)) {
      return { course: null, dateError: 'Enter a valid date' }
    }
    const candidate: Course = { startOn: form.courseStartOn, weeks }
    return isValidCourse(candidate)
      ? { course: candidate }
      : { course: null, weeksError: 'Enter a valid course' }
  },
)

const valid = computed(
  () =>
    form.key !== null &&
    scheduleValid.value &&
    !parsedPlannedDose.value.error &&
    !parsedCourse.value.weeksError &&
    !parsedCourse.value.dateError,
)

const lastDrawAt = computed(() => {
  if (!form.key) return null
  const last = lastDrawFor(form.key, shelf.vials, shelf.draws)
  return last ? toEpochMs(last.takenAt) : null
})

const createdAt = computed(() => (props.protocol ? toEpochMs(props.protocol.createdAt) : now.value))

const projectionDoseTimes = computed(() =>
  projectedDoseTimes(form.schedule, lastDrawAt.value, createdAt.value, now.value, localCalendar),
)

const projectionAmount = computed(() => {
  if (!levels.value) return null
  const planned = parsedPlannedDose.value.dose
  if (planned && areCompatible(planned.unit, levels.value.unit)) {
    return convert(planned, levels.value.unit).value
  }
  return levels.value.amount
})

const scheduleLabel = computed(() => scheduleText(form.schedule, formatTimeOfDay, weekdayName))

function save() {
  if (!valid.value) return
  const key = form.key!
  emit('save', {
    key,
    name: props.products.find((p) => p.key === key)?.name ?? props.name ?? key,
    schedule: form.schedule,
    plannedDose: parsedPlannedDose.value.dose,
    course: parsedCourse.value.course,
    site: form.site,
    siteMode: form.site ? form.siteMode : null,
    notes: form.notes.trim(),
  })
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card>
      <v-card-item>
        <v-card-title>{{ protocol ? `Protocol for ${name}` : 'Add a protocol' }}</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form class="pc-stack" @submit.prevent="save">
          <v-select
            v-if="!protocol"
            v-model="form.key"
            label="Peptide"
            :items="products"
            item-title="name"
            item-value="key"
          />

          <ScheduleEditor v-model="form.schedule" @valid="scheduleValid = $event" />

          <div class="pc-stack pc-stack--tight">
            <div class="d-flex ga-3 align-start">
              <v-text-field
                v-model="form.plannedDose"
                label="Planned dose (optional)"
                type="number"
                inputmode="decimal"
                :suffix="doseUnits.length === 1 ? unitLabel(form.plannedDoseUnit) : undefined"
                :error-messages="parsedPlannedDose.error"
              />
              <v-btn-toggle
                v-if="doseUnits.length > 1"
                v-model="form.plannedDoseUnit"
                mandatory
                density="comfortable"
                role="group"
                aria-label="Planned dose unit"
                class="protocol-dialog__units"
              >
                <v-btn v-for="u in doseUnits" :key="u" :value="u">{{ unitLabel(u) }}</v-btn>
              </v-btn-toggle>
            </div>
          </div>

          <div class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.courseWeeks"
              label="Course length in weeks (optional)"
              type="number"
              inputmode="numeric"
              :error-messages="parsedCourse.weeksError"
            />
            <v-text-field
              v-if="form.courseWeeks.trim()"
              v-model="form.courseStartOn"
              label="Course starts"
              type="date"
              :error-messages="parsedCourse.dateError"
            />
          </div>

          <fieldset class="protocol-dialog__sites">
            <legend class="pc-label">Injection site (optional)</legend>
            <v-chip-group
              :model-value="form.site ?? undefined"
              column
              color="primary"
              @update:model-value="form.site = ($event as InjectionSite | undefined) ?? null"
            >
              <v-chip
                v-for="site in INJECTION_SITES"
                :key="site"
                :value="site"
                :aria-pressed="form.site === site"
                tag="button"
                type="button"
                filter
              >
                {{ SITE_LABELS[site] }}
              </v-chip>
            </v-chip-group>
            <div class="d-flex flex-column ga-1 mt-1">
              <v-btn-toggle
                v-model="form.siteMode"
                mandatory
                density="comfortable"
                role="group"
                aria-label="Injection site mode"
                :disabled="!form.site"
              >
                <v-btn value="rotate">Rotate</v-btn>
                <v-btn value="fixed">Fixed</v-btn>
              </v-btn-toggle>
              <p v-if="form.site" class="text-body-small pc-muted">
                {{
                  form.siteMode === 'rotate'
                    ? 'Moves to the next site after each draw.'
                    : 'Uses this site for each draw.'
                }}
              </p>
            </div>
          </fieldset>

          <v-expand-transition>
            <ProjectionPanel
              v-if="levels"
              :source="levels.peptide"
              :override="levels.pk?.userSupplied ? levels.pk.params : null"
              :dose-times="projectionDoseTimes"
              :schedule-label="scheduleLabel"
              :amount="projectionAmount"
              :history="levels.history"
              :unit-label="unitLabel(levels.unit)"
            />
          </v-expand-transition>
          <v-text-field v-model="form.notes" label="Notes (optional)" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="protocol" color="error" variant="text" @click="emit('delete', protocol)">
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!valid" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.protocol-dialog__units {
  margin-top: var(--pc-field-label-band);
}

.protocol-dialog__sites {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
</style>
