<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { DrawRow } from '@/db/database'
import { findSyringe, syringeCatalog } from '@/data'
import { concentrationOf, drawVolumeMl } from '@/domain/reconstitution'
import { readSyringe } from '@/domain/syringe'
import { doseUnitsFor, formatQuantity, roundTo, unitLabel, type AmountUnit } from '@/domain/units'
import {
  formatDateTime,
  fromLocalInputValue,
  nowIso,
  systemClock,
  toIso,
  toLocalInputValue,
} from '@/services/time'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'

/** Log a draw, or edit or delete an existing draw. */
const props = defineProps<{
  draw: DrawRow | null
  /** Vial to preselect when logging a new draw. */
  vialId?: string
  /** Epoch ms for a new entry's initial time; defaults to now. */
  startAt?: number
}>()
const open = defineModel<boolean>({ required: true })

const shelf = useShelfStore()
const settings = useSettingsStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const openedAt = ref(systemClock().getTime())
const titleId = useId()
const saving = ref(false)

const form = reactive({
  vialId: '',
  dose: '',
  unit: 'mg' as AmountUnit,
  syringeId: '',
  takenAt: '',
  notes: '',
})

const vial = computed(() => shelf.vialById(form.vialId))
const showVialSelect = computed(
  () => props.draw === null && !props.vialId && shelf.activeVials.length > 1,
)
const vialItems = computed(() =>
  shelf.activeVials.map((v) => ({ title: shelf.displayName(v), value: v.id })),
)

const lastDrawn = computed(() =>
  !props.draw && vial.value ? shelf.startingDoseHint(vial.value, openedAt.value) : null,
)

function applyVialDefaults(targetVialId: string) {
  const chosen = shelf.vialById(targetVialId)
  if (!chosen) return
  const { dose, syringeId } = shelf.drawDefaultsFor(chosen)
  form.dose = dose ? String(dose.value) : ''
  form.unit = dose?.unit ?? doseUnitsFor(chosen.unit)[0]!
  form.syringeId = syringeId ?? settings.defaultSyringeId
}

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, (isOpen) => {
  if (!isOpen) return
  openedAt.value = systemClock().getTime()
  const d = props.draw
  if (d) {
    form.vialId = d.vialId
    form.dose = String(d.dose.value)
    form.unit = d.dose.unit
    form.syringeId = d.syringeId
    form.takenAt = toLocalInputValue(d.takenAt)
    form.notes = d.notes
    return
  }
  const initialVialId = props.vialId ?? shelf.activeVials[0]?.id ?? ''
  form.vialId = initialVialId
  form.dose = ''
  form.unit = 'mg'
  form.syringeId = settings.defaultSyringeId
  applyVialDefaults(initialVialId)
  form.takenAt = toLocalInputValue(props.startAt !== undefined ? toIso(props.startAt) : nowIso())
  form.notes = ''
})

watch(
  () => form.vialId,
  (next, prev) => {
    if (!open.value || props.draw !== null || !next || next === prev) return
    applyVialDefaults(next)
  },
)

const doseValue = computed(() => Number.parseFloat(form.dose))
const volumeMl = computed(() => {
  if (!vial.value || !(doseValue.value > 0)) return null
  const c = concentrationOf(
    { value: vial.value.amount, unit: vial.value.unit },
    vial.value.diluentMl,
  )
  return drawVolumeMl({ value: doseValue.value, unit: form.unit }, c)
})
const reading = computed(() =>
  volumeMl.value === null ? null : readSyringe(volumeMl.value, findSyringe(form.syringeId)),
)
const unitItems = computed(() =>
  vial.value ? doseUnitsFor(vial.value.unit).map((u) => ({ title: unitLabel(u), value: u })) : [],
)

async function save() {
  if (!vial.value || volumeMl.value === null || !form.takenAt) return
  saving.value = true
  const input = {
    vialId: vial.value.id,
    takenAt: fromLocalInputValue(form.takenAt),
    dose: { value: doseValue.value, unit: form.unit },
    volumeMl: volumeMl.value,
    syringeId: form.syringeId,
    notes: form.notes.trim(),
  }
  try {
    if (props.draw) {
      await shelf.updateDraw(props.draw.id, input)
      notify.show('Draw updated', 'success')
    } else {
      await shelf.addDraw(input)
      notify.show(
        `Logged ${formatQuantity(input.dose)} of ${shelf.displayName(vial.value)}`,
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
  const d = props.draw
  if (!d) return
  const ok = await confirm.ask({
    title: 'Delete this draw?',
    text: `${roundTo(d.dose.value, 4)} ${unitLabel(d.dose.unit)} on ${formatDateTime(d.takenAt)} will be added back to the vial.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await shelf.deleteDraw(d.id)
  notify.show('Draw deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ draw ? 'Edit' : 'Log' }}</p>
        <v-card-title :id="titleId">{{ draw ? 'Edit draw' : 'Log a draw' }}</v-card-title>
        <v-card-subtitle v-if="vial && !showVialSelect">{{
          shelf.displayName(vial)
        }}</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <v-form class="pc-stack" @submit.prevent="save">
          <v-select v-if="showVialSelect" v-model="form.vialId" :items="vialItems" label="Vial" />
          <div class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.dose"
              label="Dose"
              type="number"
              inputmode="decimal"
              :hint="lastDrawn ?? undefined"
              persistent-hint
              autofocus
            />
            <v-select v-model="form.unit" :items="unitItems" label="Unit" class="log-draw__unit" />
          </div>
          <v-select
            v-model="form.syringeId"
            :items="syringeCatalog.syringes.map((s) => ({ title: s.label, value: s.id }))"
            label="Syringe"
          />
          <v-text-field v-model="form.takenAt" label="Taken at" type="datetime-local" />
          <v-textarea v-model="form.notes" label="Notes (site, observations)" />
          <div v-if="reading" class="pc-inset pa-3 pc-num" data-testid="log-draw-reading">
            Draw <strong>{{ roundTo(reading.scaleValue, 2) }} {{ reading.scaleUnit }}</strong> ({{
              roundTo(reading.volumeMl, 3)
            }}
            mL)
          </div>
          <template v-if="draw">
            <v-divider />
            <div>
              <v-btn variant="text" color="error" @click="remove">Delete draw</v-btn>
            </div>
          </template>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="volumeMl === null || !form.takenAt"
          :loading="saving"
          @click="save"
        >
          {{ draw ? 'Save' : 'Log draw' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.log-draw__unit {
  max-width: 120px;
}
</style>
