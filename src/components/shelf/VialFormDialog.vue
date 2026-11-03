<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { VialRow } from '@/db/database'
import type { NewVial } from '@/db/repository'
import { findPeptide } from '@/data'
import { blendTotalMg } from '@/domain/blend'
import { doseUnitsFor, unitLabel, type AmountUnit } from '@/domain/units'
import { fromLocalInputValue, toLocalInputValue } from '@/services/time'

const props = defineProps<{ vial: VialRow }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ save: [changes: Partial<NewVial>] }>()

interface Form {
  name: string
  amount: string
  unit: AmountUnit
  diluentMl: string
  reconstitutedAt: string
  typicalDose: string
  typicalDoseUnit: AmountUnit
  components: { name: string; amountMg: string; peptideId: string | null }[]
  useCustomPk: boolean
  halfLifeHours: string
  tmaxHours: string
  notes: string
}

const form = reactive<Form>(blankForm())

function blankForm(): Form {
  return {
    name: '',
    amount: '',
    unit: 'mg',
    diluentMl: '',
    reconstitutedAt: '',
    typicalDose: '',
    typicalDoseUnit: 'mg',
    components: [],
    useCustomPk: false,
    halfLifeHours: '',
    tmaxHours: '',
    notes: '',
  }
}

// Reset the form from the vial each time the dialog opens, discarding abandoned edits.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const v = props.vial
    Object.assign(form, {
      name: v.name,
      amount: String(v.amount),
      unit: v.unit,
      diluentMl: String(v.diluentMl),
      reconstitutedAt: v.reconstitutedAt ? toLocalInputValue(v.reconstitutedAt) : '',
      typicalDose: v.typicalDose ? String(v.typicalDose.value) : '',
      typicalDoseUnit: v.typicalDose?.unit ?? doseUnitsFor(v.unit)[0]!,
      components: (v.components ?? []).map((c) => ({ ...c, amountMg: String(c.amountMg) })),
      useCustomPk: v.pkOverride !== null,
      halfLifeHours: v.pkOverride ? String(v.pkOverride.halfLifeHours) : '',
      tmaxHours: v.pkOverride ? String(v.pkOverride.tmaxHours) : '',
      notes: v.notes,
    } satisfies Form)
  },
  { immediate: true },
)

const catalogPk = computed(() => findPeptide(props.vial.peptideId)?.pk ?? null)
const isBlend = computed(() => form.components.length > 1)

const positive = (v: string) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n > 0
}
const rules = {
  required: (v: string) => !!v?.trim() || 'Required',
  positive: (v: string) => positive(v) || 'Enter a number greater than 0',
  optionalPositive: (v: string) => !v || positive(v) || 'Enter a number greater than 0',
}

const valid = computed(() => {
  if (!form.name.trim() || !positive(form.diluentMl)) return false
  if (isBlend.value) {
    if (!form.components.every((c) => c.name.trim() && positive(c.amountMg))) return false
  } else if (!positive(form.amount)) return false
  if (form.typicalDose && !positive(form.typicalDose)) return false
  if (form.useCustomPk && !(positive(form.halfLifeHours) && positive(form.tmaxHours))) return false
  return true
})

const blendTotal = computed(() =>
  blendTotalMg(
    form.components.map((c) => ({ ...c, amountMg: Number.parseFloat(c.amountMg) || 0 })),
  ),
)

function save() {
  if (!valid.value) return
  const components = isBlend.value
    ? form.components.map((c) => ({
        name: c.name.trim(),
        amountMg: Number.parseFloat(c.amountMg),
        peptideId: c.peptideId,
      }))
    : null
  emit('save', {
    name: form.name.trim(),
    unit: form.unit,
    amount: components ? blendTotalMg(components) : Number.parseFloat(form.amount),
    diluentMl: Number.parseFloat(form.diluentMl),
    components,
    reconstitutedAt: form.reconstitutedAt ? fromLocalInputValue(form.reconstitutedAt) : null,
    typicalDose: form.typicalDose
      ? { value: Number.parseFloat(form.typicalDose), unit: form.typicalDoseUnit }
      : null,
    pkOverride: form.useCustomPk
      ? {
          halfLifeHours: Number.parseFloat(form.halfLifeHours),
          tmaxHours: Number.parseFloat(form.tmaxHours),
        }
      : null,
    notes: form.notes.trim(),
  })
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card>
      <v-card-item>
        <v-card-title>Edit vial</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form class="pc-stack" @submit.prevent="save">
          <v-text-field v-model="form.name" label="Name" :rules="[rules.required]" />

          <template v-if="isBlend">
            <div class="pc-stack pc-stack--tight">
              <p class="pc-label">Composition per vial (total {{ blendTotal }} mg)</p>
              <div v-for="(c, i) in form.components" :key="i" class="d-flex ga-3 align-start">
                <v-text-field
                  v-model="c.name"
                  :label="`Component ${i + 1}`"
                  :rules="[rules.required]"
                />
                <v-text-field
                  v-model="c.amountMg"
                  label="Amount"
                  suffix="mg"
                  type="number"
                  inputmode="decimal"
                  :rules="[rules.positive]"
                  class="vial-form__amount"
                />
              </div>
            </div>
          </template>
          <div v-else class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.amount"
              label="Peptide in vial"
              type="number"
              inputmode="decimal"
              :rules="[rules.positive]"
            />
            <v-text-field
              :model-value="unitLabel(form.unit)"
              label="Unit"
              readonly
              hint="Fixed once a vial exists"
              persistent-hint
              class="vial-form__unit"
            />
          </div>

          <v-text-field
            v-model="form.diluentMl"
            label="Bacteriostatic water added"
            suffix="mL"
            type="number"
            inputmode="decimal"
            :rules="[rules.positive]"
            hint="Doesn't change volumes already logged."
            persistent-hint
          />

          <v-text-field v-model="form.reconstitutedAt" label="Mixed on" type="datetime-local" />

          <div class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.typicalDose"
              label="Usual dose"
              type="number"
              inputmode="decimal"
              :rules="[rules.optionalPositive]"
            />
            <v-select
              v-model="form.typicalDoseUnit"
              :items="doseUnitsFor(form.unit).map((u) => ({ title: unitLabel(u), value: u }))"
              label="Unit"
              class="vial-form__unit"
            />
          </div>

          <v-divider />
          <div>
            <v-switch
              v-model="form.useCustomPk"
              label="Use my own half-life for the level chart"
              hide-details
            />
            <p class="text-body-small pc-muted">
              <template v-if="catalogPk">
                Replaces the published values (t½ {{ catalogPk.halfLifeHours }} h, peak
                {{ catalogPk.tmaxHours }} h).
              </template>
              <template v-else> No reliable human data for this peptide. </template>
            </p>
          </div>
          <div v-if="form.useCustomPk" class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.halfLifeHours"
              label="Half-life"
              suffix="hours"
              type="number"
              inputmode="decimal"
              :rules="[rules.positive]"
            />
            <v-text-field
              v-model="form.tmaxHours"
              label="Time to peak"
              suffix="hours"
              type="number"
              inputmode="decimal"
              :rules="[rules.positive]"
            />
          </div>

          <v-textarea v-model="form.notes" label="Notes" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!valid" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.vial-form__unit {
  max-width: 120px;
}

.vial-form__amount {
  max-width: 160px;
}
</style>
