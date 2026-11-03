<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { GlucoseRow } from '@/db/database'
import {
  A1C_RANGE,
  GLUCOSE_CONTEXTS,
  GLUCOSE_CONTEXT_LABELS,
  GLUCOSE_RANGE_MG_DL,
  decimalsFor,
  formatA1c,
  formatGlucose,
  fromA1cPercent,
  fromMgDl,
  isValidA1c,
  isValidGlucose,
  toA1cPercent,
  toMgDl,
  type GlucoseContext,
} from '@/domain/glucose'
import { roundTo } from '@/domain/units'
import type { NewGlucose } from '@/db/repository'
import { useJournalStore } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { fromLocalInputValue, nowIso, toLocalInputValue } from '@/services/time'

/**
 * Log or edit an HbA1c result or a glucose reading, in the units chosen in Settings. Values
 * are stored canonically (percent, mg/dL) and unrounded; an edit that leaves the number alone
 * keeps the stored value exactly.
 */
const props = defineProps<{
  reading: GlucoseRow | null
  /** Which kind a new entry starts on. */
  initialKind?: 'a1c' | 'glucose'
}>()
const open = defineModel<boolean>({ required: true })

const journal = useJournalStore()
const settings = useSettingsStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const titleId = useId()
const kindLabelId = useId()
const contextLabelId = useId()
const saving = ref(false)

const form = reactive({
  kind: 'a1c' as 'a1c' | 'glucose',
  value: '',
  context: 'fasting' as GlucoseContext,
  measuredAt: '',
  notes: '',
})
const initialValue = ref('')

const unit = computed(() => (form.kind === 'a1c' ? settings.a1cUnit : settings.glucoseUnit))

/** A stored reading as the number to edit, one place finer than display so nothing is lost. */
function shown(r: GlucoseRow): string {
  if (r.kind === 'a1c') {
    const u = settings.a1cUnit
    return String(roundTo(fromA1cPercent(r.value, u), decimalsFor(u) + 1))
  }
  const u = settings.glucoseUnit
  return String(roundTo(fromMgDl(r.value, u), decimalsFor(u) + 1))
}

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, (isOpen) => {
  if (!isOpen) return
  const r = props.reading
  form.kind = r?.kind ?? props.initialKind ?? 'a1c'
  form.value = r ? shown(r) : ''
  initialValue.value = form.value
  form.context = r?.kind === 'glucose' ? r.context : 'fasting'
  form.measuredAt = toLocalInputValue(r?.measuredAt ?? nowIso())
  form.notes = r?.notes ?? ''
})

/** The canonical value entered (percent or mg/dL), or null when it is not a plausible result. */
const canonical = computed(() => {
  const n = Number.parseFloat(form.value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (form.kind === 'a1c') {
    const percent = toA1cPercent(n, settings.a1cUnit)
    return isValidA1c(percent) ? percent : null
  }
  const mgDl = toMgDl(n, settings.glucoseUnit)
  return isValidGlucose(mgDl) ? mgDl : null
})

const error = computed(() => {
  if (!form.value || canonical.value !== null) return undefined
  return form.kind === 'a1c'
    ? `Enter an HbA1c between ${formatA1c(A1C_RANGE.min, settings.a1cUnit)} and ${formatA1c(A1C_RANGE.max, settings.a1cUnit)}`
    : `Enter a glucose between ${formatGlucose(GLUCOSE_RANGE_MG_DL.min, settings.glucoseUnit)} and ${formatGlucose(GLUCOSE_RANGE_MG_DL.max, settings.glucoseUnit)}`
})

const previous = computed(() =>
  journal.glucose.find((g) => g.kind === form.kind && g.id !== props.reading?.id),
)
const previousText = computed(() => {
  const p = previous.value
  if (!p) return ''
  return p.kind === 'a1c'
    ? formatA1c(p.value, settings.a1cUnit)
    : formatGlucose(p.value, settings.glucoseUnit)
})

async function save() {
  if (canonical.value === null || !form.measuredAt) return
  saving.value = true
  const r = props.reading
  const unchanged = r !== null && r.kind === form.kind && form.value === initialValue.value
  const value = unchanged ? r.value : canonical.value
  const common = {
    value,
    measuredAt: fromLocalInputValue(form.measuredAt),
    notes: form.notes.trim(),
  }
  const input: NewGlucose =
    form.kind === 'a1c'
      ? {
          ...common,
          kind: 'a1c',
          enteredUnit: unchanged && r.kind === 'a1c' ? r.enteredUnit : settings.a1cUnit,
          context: null,
        }
      : {
          ...common,
          kind: 'glucose',
          enteredUnit: unchanged && r.kind === 'glucose' ? r.enteredUnit : settings.glucoseUnit,
          context: form.context,
        }
  try {
    if (r) await journal.updateGlucose(r.id, input)
    else await journal.addGlucose(input)
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
    text: `${r.kind === 'a1c' ? `HbA1c ${formatA1c(r.value, settings.a1cUnit)}` : `Glucose ${formatGlucose(r.value, settings.glucoseUnit)}`}. This can't be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await journal.deleteGlucose(r.id)
  notify.show('Reading deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ reading ? 'Edit' : 'Log' }}</p>
        <v-card-title :id="titleId">Blood sugar</v-card-title>
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
            <v-btn value="a1c">HbA1c</v-btn>
            <v-btn value="glucose">Glucose</v-btn>
          </v-btn-toggle>
        </div>
        <v-text-field
          v-model="form.value"
          :label="form.kind === 'a1c' ? 'HbA1c' : 'Glucose'"
          type="number"
          inputmode="decimal"
          :suffix="unit"
          :error-messages="error"
          :hint="form.kind === 'a1c' ? 'From a lab report or a home test kit' : undefined"
        />
        <p v-if="previous" class="text-body-small pc-faint">Last time: {{ previousText }}</p>
        <div v-if="form.kind === 'glucose'">
          <p :id="contextLabelId" class="pc-label">When in the day</p>
          <v-chip-group
            v-model="form.context"
            mandatory
            column
            color="primary"
            :aria-labelledby="contextLabelId"
          >
            <v-chip
              v-for="c in GLUCOSE_CONTEXTS"
              :key="c"
              :value="c"
              :aria-pressed="form.context === c"
              tag="button"
              filter
            >
              {{ GLUCOSE_CONTEXT_LABELS[c] }}
            </v-chip>
          </v-chip-group>
          <p class="text-body-small pc-muted">
            Fasting: before eating or drinking anything but water, usually first thing in the
            morning.
          </p>
        </div>
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
        <v-btn
          color="primary"
          variant="flat"
          :disabled="canonical === null"
          :loading="saving"
          @click="save"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
