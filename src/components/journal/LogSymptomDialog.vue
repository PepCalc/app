<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { SymptomRow } from '@/db/database'
import {
  PANCREATITIS_NOTE,
  SEVERITIES,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SYMPTOMS,
  SYMPTOM_LABELS,
  symptomName,
  type Severity,
  type Symptom,
} from '@/domain/symptoms'
import { useJournalStore } from '@/stores/journal'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { fromLocalInputValue, nowIso, toIso, toLocalInputValue } from '@/services/time'
import SourceList from '@/components/common/SourceList.vue'

/**
 * Log how you felt: one or more side effects at one time and strength, saved as one entry each
 * so each can be counted and edited on its own. Editing an entry changes that one alone.
 */
const props = defineProps<{
  symptom: SymptomRow | null
  /** Epoch ms for a new entry's initial time; defaults to now. */
  startAt?: number
}>()
const open = defineModel<boolean>({ required: true })

const journal = useJournalStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const titleId = useId()
const severityLabelId = useId()
const saving = ref(false)

const form = reactive({
  symptoms: [] as Symptom[],
  otherText: '',
  severity: 'mild' as Severity,
  occurredAt: '',
  notes: '',
})

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, (isOpen) => {
  if (!isOpen) return
  const s = props.symptom
  form.symptoms = s ? [s.symptom] : []
  form.otherText = s?.otherText ?? ''
  form.severity = s?.severity ?? 'mild'
  form.occurredAt = toLocalInputValue(
    s?.occurredAt ?? (props.startAt !== undefined ? toIso(props.startAt) : nowIso()),
  )
  form.notes = s?.notes ?? ''
})

/** An edit is one entry, so it holds one symptom; a new log can hold several. */
const editing = computed(() => props.symptom !== null)
const otherChosen = computed(() => form.symptoms.includes('other'))
const valid = computed(
  () =>
    form.symptoms.length > 0 &&
    !!form.occurredAt &&
    (!otherChosen.value || form.otherText.trim().length > 0),
)
const showPancreatitisNote = computed(
  () => form.severity === 'severe' && form.symptoms.includes('stomach-pain'),
)

function toggle(symptom: Symptom) {
  if (editing.value) {
    form.symptoms = [symptom]
    return
  }
  form.symptoms = form.symptoms.includes(symptom)
    ? form.symptoms.filter((s) => s !== symptom)
    : [...form.symptoms, symptom]
}

async function save() {
  if (!valid.value) return
  saving.value = true
  const occurredAt = fromLocalInputValue(form.occurredAt)
  const notes = form.notes.trim()
  const entry = (symptom: Symptom) => ({
    symptom,
    otherText: symptom === 'other' ? form.otherText.trim() : '',
    severity: form.severity,
    occurredAt,
    notes,
  })
  try {
    if (props.symptom) {
      await journal.updateSymptom(props.symptom.id, entry(form.symptoms[0]!))
      notify.show('Side effect updated', 'success')
    } else {
      await journal.addSymptoms(form.symptoms.map(entry))
      notify.show(
        form.symptoms.length > 1 ? 'Side effects logged' : 'Side effect logged',
        'success',
      )
    }
    open.value = false
  } catch {
    notify.show("Couldn't save. Try again.", 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const s = props.symptom
  if (!s) return
  const ok = await confirm.ask({
    title: 'Delete this entry?',
    text: `${symptomName(s)}, ${SEVERITY_LABELS[s.severity].toLowerCase()}. This can't be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await journal.deleteSymptom(s.id)
  notify.show('Side effect deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="560" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ symptom ? 'Edit' : 'Log' }}</p>
        <v-card-title :id="titleId">Side effects</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <fieldset class="plain">
          <legend class="pc-label">
            {{ editing ? 'What you felt' : 'What did you feel? Choose any that apply' }}
          </legend>
          <div class="chips">
            <v-chip
              v-for="s in SYMPTOMS"
              :key="s"
              tag="button"
              filter
              :color="form.symptoms.includes(s) ? 'primary' : undefined"
              :variant="form.symptoms.includes(s) ? 'tonal' : 'outlined'"
              :aria-pressed="form.symptoms.includes(s)"
              @click="toggle(s)"
            >
              {{ SYMPTOM_LABELS[s] }}
            </v-chip>
          </div>
        </fieldset>
        <v-text-field
          v-if="otherChosen"
          v-model="form.otherText"
          label="Describe it"
          maxlength="60"
          counter
        />
        <div>
          <p :id="severityLabelId" class="pc-label">How strong</p>
          <v-btn-toggle
            v-model="form.severity"
            role="group"
            mandatory
            density="comfortable"
            :aria-labelledby="severityLabelId"
          >
            <v-btn v-for="level in SEVERITIES" :key="level" :value="level">
              {{ SEVERITY_LABELS[level] }}
            </v-btn>
          </v-btn-toggle>
          <p class="text-body-small pc-muted mt-1">{{ SEVERITY_HINTS[form.severity] }}</p>
        </div>
        <div v-if="showPancreatitisNote" class="pc-inset pc-stack pc-stack--tight" role="note">
          <p class="text-body-medium">{{ PANCREATITIS_NOTE.text }}</p>
          <SourceList :sources="[PANCREATITIS_NOTE.source]" />
        </div>
        <v-text-field v-model="form.occurredAt" label="When" type="datetime-local" />
        <v-textarea
          v-model="form.notes"
          label="Notes (optional)"
          hint="What helped, what you ate, how long it lasted"
        />
        <template v-if="symptom">
          <v-divider />
          <div>
            <v-btn variant="text" color="error" @click="remove">Delete entry</v-btn>
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
.plain {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
