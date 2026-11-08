<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { VitalRow } from '@/db/database'
import type { NewVital } from '@/db/repository'
import {
  DIASTOLIC_RANGE,
  HEART_RATE_RANGE,
  SYSTOLIC_RANGE,
  formatBloodPressure,
  formatHeartRate,
  isValidBloodPressure,
  isValidHeartRate,
  type VitalKind,
} from '@/domain/vitals'
import { useJournalStore } from '@/stores/journal'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { fromLocalInputValue, nowIso, toLocalInputValue } from '@/services/time'

/**
 * Log or edit a blood pressure or resting heart rate reading. Numbers are kept as typed; an
 * edit that leaves them alone keeps the stored values exactly.
 */
const props = defineProps<{
  reading: VitalRow | null
  /** Which kind a new entry starts on. */
  initialKind?: VitalKind
}>()
const open = defineModel<boolean>({ required: true })

const journal = useJournalStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const titleId = useId()
const kindLabelId = useId()
const saving = ref(false)

const form = reactive({
  kind: 'bp' as VitalKind,
  systolic: '',
  diastolic: '',
  bpm: '',
  measuredAt: '',
  notes: '',
})

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, (isOpen) => {
  if (!isOpen) return
  const r = props.reading
  form.kind = r?.kind ?? props.initialKind ?? 'bp'
  form.systolic = r?.kind === 'bp' ? String(r.systolic) : ''
  form.diastolic = r?.kind === 'bp' ? String(r.diastolic) : ''
  form.bpm = r?.kind === 'hr' ? String(r.bpm) : ''
  form.measuredAt = toLocalInputValue(r?.measuredAt ?? nowIso())
  form.notes = r?.notes ?? ''
})

const num = (text: string) => Number.parseFloat(text)

const valid = computed(() =>
  form.kind === 'bp'
    ? isValidBloodPressure(num(form.systolic), num(form.diastolic))
    : isValidHeartRate(num(form.bpm)),
)

const rangeError = (text: string, range: { min: number; max: number }, unit: string) => {
  if (!text) return undefined
  const n = num(text)
  return n >= range.min && n <= range.max ? undefined : `Enter ${range.min} to ${range.max} ${unit}`
}

const systolicError = computed(() => rangeError(form.systolic, SYSTOLIC_RANGE, 'mmHg'))
const diastolicError = computed(() => {
  const own = rangeError(form.diastolic, DIASTOLIC_RANGE, 'mmHg')
  if (own || !form.systolic || !form.diastolic || systolicError.value) return own
  return num(form.diastolic) < num(form.systolic) ? undefined : 'Lower than systolic'
})
const bpmError = computed(() => rangeError(form.bpm, HEART_RATE_RANGE, 'bpm'))

const previous = computed(() =>
  journal.vitals.find((v) => v.kind === form.kind && v.id !== props.reading?.id),
)
const previousText = computed(() => {
  const p = previous.value
  if (!p) return ''
  return p.kind === 'bp' ? formatBloodPressure(p.systolic, p.diastolic) : formatHeartRate(p.bpm)
})

async function save() {
  if (!valid.value || !form.measuredAt) return
  saving.value = true
  const r = props.reading
  const common = { measuredAt: fromLocalInputValue(form.measuredAt), notes: form.notes.trim() }
  const input: NewVital =
    form.kind === 'bp'
      ? { ...common, kind: 'bp', systolic: num(form.systolic), diastolic: num(form.diastolic) }
      : { ...common, kind: 'hr', bpm: num(form.bpm) }
  try {
    if (r) await journal.updateVital(r.id, input)
    else await journal.addVital(input)
    notify.show(r ? 'Reading updated' : 'Reading logged', 'success')
    open.value = false
  } catch {
    notify.show("Couldn't save. Try again.", 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const r = props.reading
  if (!r) return
  const ok = await confirm.ask({
    title: 'Delete this reading?',
    text: `${r.kind === 'bp' ? `Blood pressure ${formatBloodPressure(r.systolic, r.diastolic)}` : `Heart rate ${formatHeartRate(r.bpm)}`}. This can't be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await journal.deleteVital(r.id)
  notify.show('Reading deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ reading ? 'Edit' : 'Log' }}</p>
        <v-card-title :id="titleId">Vitals</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <div>
          <p :id="kindLabelId" class="pc-label">Reading</p>
          <v-btn-toggle
            v-model="form.kind"
            role="group"
            mandatory
            density="comfortable"
            :aria-labelledby="kindLabelId"
          >
            <v-btn value="bp">Blood pressure</v-btn>
            <v-btn value="hr">Heart rate</v-btn>
          </v-btn-toggle>
        </div>
        <div v-if="form.kind === 'bp'" class="bp-fields">
          <v-text-field
            v-model="form.systolic"
            label="Systolic"
            type="number"
            inputmode="numeric"
            suffix="mmHg"
            hint="Top number"
            persistent-hint
            :error-messages="systolicError"
          />
          <v-text-field
            v-model="form.diastolic"
            label="Diastolic"
            type="number"
            inputmode="numeric"
            suffix="mmHg"
            hint="Bottom number"
            persistent-hint
            :error-messages="diastolicError"
          />
        </div>
        <v-text-field
          v-else
          v-model="form.bpm"
          label="Resting heart rate"
          type="number"
          inputmode="numeric"
          suffix="bpm"
          hint="Sitting still"
          persistent-hint
          :error-messages="bpmError"
        />
        <p v-if="previous" class="text-body-small pc-faint">Last time: {{ previousText }}</p>
        <v-text-field v-model="form.measuredAt" label="When" type="datetime-local" />
        <v-textarea v-model="form.notes" label="Notes (optional)" />
        <template v-if="reading">
          <v-divider />
          <div>
            <v-btn variant="text" color="error" @click="remove">Delete reading</v-btn>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!valid" :loading="saving" @click="save">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.bp-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
</style>
