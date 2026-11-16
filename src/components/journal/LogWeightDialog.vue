<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { formatWeight, fromKg, toKg } from '@/domain/bodyUnits'
import { roundTo } from '@/domain/units'
import { useJournalStore, type WeightEntry } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { fromLocalInputValue, nowIso, toIso, toLocalInputValue } from '@/services/time'

/** Log a weigh-in, or edit or delete one. Entry is in the weight unit chosen in Settings. */
const props = defineProps<{
  weight: WeightEntry | null
  /** Epoch ms for a new entry's initial time; defaults to now. */
  startAt?: number
}>()
const open = defineModel<boolean>({ required: true })

const journal = useJournalStore()
const settings = useSettingsStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const titleId = useId()
const saving = ref(false)

const form = reactive({ value: '', measuredAt: '', notes: '' })
/** The value as first shown, so an edit that leaves it alone keeps the stored, unrounded weight. */
const initialValue = ref('')
const unit = computed(() => settings.weightUnit)

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, (isOpen) => {
  if (!isOpen) return
  const w = props.weight
  form.value = w ? String(roundTo(fromKg(w.kg, unit.value), 2)) : ''
  initialValue.value = form.value
  form.measuredAt = toLocalInputValue(
    w?.measuredAt ?? (props.startAt !== undefined ? toIso(props.startAt) : nowIso()),
  )
  form.notes = w?.notes ?? ''
})

/** Kilograms entered, or null. The range covers every adult scale reading without rejecting one. */
const kg = computed(() => {
  const n = Number.parseFloat(form.value)
  if (!Number.isFinite(n) || n <= 0) return null
  const value = toKg(n, unit.value)
  return value >= 20 && value <= 400 ? value : null
})

const error = computed(() =>
  form.value && kg.value === null
    ? `Enter a weight between ${formatWeight(20, unit.value)} and ${formatWeight(400, unit.value)}`
    : undefined,
)

const previous = computed(() => journal.weights.find((w) => w.id !== props.weight?.id))

async function save() {
  if (kg.value === null || !form.measuredAt) return
  saving.value = true
  const unchanged = props.weight !== null && form.value === initialValue.value
  const input = {
    kg: unchanged ? props.weight.kg : kg.value,
    enteredUnit: unchanged ? props.weight.enteredUnit : unit.value,
    measuredAt: fromLocalInputValue(form.measuredAt),
    notes: form.notes.trim(),
  }
  try {
    if (props.weight) await journal.updateWeight(props.weight.id, input)
    else await journal.addWeight(input)
    notify.show(props.weight ? 'Weight updated' : 'Weight logged', 'success')
    open.value = false
  } catch {
    notify.show("Couldn't save. Try again.", 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const w = props.weight
  if (!w) return
  const ok = await confirm.ask({
    title: 'Delete this weigh-in?',
    text: `${formatWeight(w.kg, settings.weightUnit)}. This can't be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await journal.deleteWeight(w.id)
  notify.show('Weigh-in deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ weight ? 'Edit' : 'Log' }}</p>
        <v-card-title :id="titleId">Weigh-in</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <v-text-field
          v-model="form.value"
          label="Weight"
          type="number"
          inputmode="decimal"
          :suffix="unit"
          :error-messages="error"
          autofocus
        />
        <p v-if="previous" class="text-body-small pc-faint">
          Last time: {{ formatWeight(previous.kg, unit) }}
        </p>
        <v-text-field v-model="form.measuredAt" label="When" type="datetime-local" />
        <v-textarea v-model="form.notes" label="Notes (optional)" />
        <template v-if="weight">
          <v-divider />
          <div>
            <v-btn variant="text" color="error" @click="remove">Delete weigh-in</v-btn>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="kg === null"
          :loading="saving"
          @click="save"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
