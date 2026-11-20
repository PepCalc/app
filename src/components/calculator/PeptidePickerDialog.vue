<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { allPeptidesSorted, matchSinglePeptide } from '@/data'
import { blendTotalMg, type BlendComponent } from '@/domain/blend'
import type { CatalogPeptide } from '@/domain/catalog'
import { unitLabel, type AmountUnit } from '@/domain/units'
import type { CustomBlendChoice, CustomPeptideChoice } from '@/composables/useCalculator'
import { mdiCheckCircle, mdiDeleteOutline, mdiMagnify, mdiPlus } from '@/plugins/icons'

export type PickerMode = 'all' | 'custom' | 'blend'

const props = withDefaults(
  defineProps<{
    currentPeptideId: string
    initialMode?: PickerMode
    currentCustomName?: string
    currentVialUnit?: AmountUnit
    currentVialAmount?: number | null
    currentComponents?: readonly BlendComponent[]
  }>(),
  {
    initialMode: 'all',
    currentCustomName: '',
    currentVialUnit: 'mg',
    currentVialAmount: null,
    currentComponents: () => [],
  },
)

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{
  select: [peptideId: string]
  selectCustom: [choice: CustomPeptideChoice]
  selectCustomBlend: [choice: CustomBlendChoice]
}>()

const MAX_COMPONENTS = 6

const mode = ref<PickerMode>('all')
const search = ref('')

interface ComponentDraft {
  id: number
  name: string
  amountMg: string
}

let nextRowId = 1
const makeRow = (name = '', amountMg = ''): ComponentDraft => ({
  id: nextRowId++,
  name,
  amountMg,
})

const customForm = reactive({
  name: '',
  vialUnit: 'mg' as AmountUnit,
  vialAmount: '',
})

const blendForm = reactive({
  name: '',
  components: [makeRow(), makeRow()] as ComponentDraft[],
})

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    mode.value = props.initialMode
    search.value = ''
    customForm.name = props.currentCustomName
    customForm.vialUnit = props.currentVialUnit
    customForm.vialAmount = props.currentVialAmount ? String(props.currentVialAmount) : ''
    blendForm.name = props.currentCustomName
    blendForm.components =
      props.currentComponents.length >= 2
        ? props.currentComponents.map((c) => makeRow(c.name, String(c.amountMg)))
        : [makeRow(), makeRow()]
  },
  { immediate: true },
)

const singlePeptideNames = allPeptidesSorted.filter((p) => p.kind === 'single').map((p) => p.name)
const suggestionsId = useId()

const filteredPeptides = computed<readonly CatalogPeptide[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return allPeptidesSorted
  return allPeptidesSorted.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q)) ||
      p.summary.toLowerCase().includes(q),
  )
})

function subtitleFor(p: CatalogPeptide): string {
  if (p.kind === 'blend' && p.components?.length) {
    return p.components.map((c) => `${c.name} ${c.amountMg} mg`).join(' + ')
  }
  return p.aliases.slice(0, 2).join(', ') || p.summary
}

const positive = (v: string) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n > 0
}

const customValid = computed(() => !customForm.vialAmount.trim() || positive(customForm.vialAmount))

const blendTotal = computed(() =>
  blendTotalMg(
    blendForm.components.map((c) => ({
      name: c.name,
      amountMg: Number.parseFloat(c.amountMg) || 0,
      peptideId: null,
    })),
  ),
)

const blendValid = computed(
  () =>
    blendForm.components.length >= 2 &&
    blendForm.components.every((c) => c.name.trim().length > 0 && positive(c.amountMg)),
)

const rules = {
  required: (v: string) => !!v?.trim() || 'Required',
  positive: (v: string) => positive(v) || 'Enter a number greater than 0',
  optionalPositive: (v: string) => !v?.trim() || positive(v) || 'Enter a number greater than 0',
}

function chooseCatalog(id: string) {
  emit('select', id)
  open.value = false
}

function startCustomFromSearch(target: 'custom' | 'blend') {
  const name = search.value.trim()
  if (target === 'custom') customForm.name = name
  else blendForm.name = name
  mode.value = target
}

function addComponent() {
  if (blendForm.components.length >= MAX_COMPONENTS) return
  blendForm.components.push(makeRow())
}

function removeComponent(index: number) {
  if (blendForm.components.length <= 2) return
  blendForm.components.splice(index, 1)
}

function submitCustom() {
  if (!customValid.value) return
  emit('selectCustom', {
    name: customForm.name.trim(),
    vialUnit: customForm.vialUnit,
    vialAmount: customForm.vialAmount.trim() ? Number.parseFloat(customForm.vialAmount) : null,
  })
  open.value = false
}

function submitBlend() {
  if (!blendValid.value) return
  const components: BlendComponent[] = blendForm.components.map((c) => {
    const trimmed = c.name.trim()
    const match = matchSinglePeptide(trimmed)
    return {
      name: match?.name ?? trimmed,
      amountMg: Number.parseFloat(c.amountMg),
      peptideId: match?.id ?? null,
    }
  })
  emit('selectCustomBlend', {
    name: blendForm.name.trim() || components.map((c) => c.name).join(' + '),
    components,
  })
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card class="picker">
      <v-card-item>
        <p class="pc-eyebrow">Peptides</p>
        <v-card-title>More &amp; Custom</v-card-title>
      </v-card-item>

      <div class="picker__modes">
        <v-btn-toggle
          v-model="mode"
          mandatory
          density="comfortable"
          class="pc-toggle-wrap"
          aria-label="Peptide source"
        >
          <v-btn value="all">All peptides</v-btn>
          <v-btn value="custom">Custom peptide</v-btn>
          <v-btn value="blend">Custom blend</v-btn>
        </v-btn-toggle>
      </div>

      <v-card-text class="pc-stack">
        <template v-if="mode === 'all'">
          <v-text-field
            v-model="search"
            label="Search peptides"
            placeholder="Name, alias or blend"
            :append-inner-icon="mdiMagnify"
            clearable
            density="comfortable"
          />

          <v-list v-if="filteredPeptides.length" class="picker__list" lines="two">
            <v-list-item
              v-for="p in filteredPeptides"
              :key="p.id"
              :active="p.id === currentPeptideId"
              :subtitle="subtitleFor(p)"
              rounded="lg"
              @click="chooseCatalog(p.id)"
            >
              <template #title>
                <span class="picker__item-title">
                  <span>{{ p.name }}</span>
                  <span v-if="p.kind === 'blend'" class="pc-badge">Blend</span>
                </span>
              </template>
              <template v-if="p.id === currentPeptideId" #append>
                <v-icon :icon="mdiCheckCircle" color="primary" size="20" />
              </template>
            </v-list-item>
          </v-list>

          <div v-else class="picker__empty pc-inset pa-4 pc-stack pc-stack--tight">
            <p class="pc-muted">No catalog peptide matches "{{ search.trim() }}".</p>
            <div class="d-flex flex-wrap ga-2">
              <v-btn variant="tonal" color="primary" @click="startCustomFromSearch('custom')">
                Create custom peptide
              </v-btn>
              <v-btn variant="tonal" @click="startCustomFromSearch('blend')">
                Create custom blend
              </v-btn>
            </div>
          </div>
        </template>

        <v-form v-else-if="mode === 'custom'" class="pc-stack" @submit.prevent="submitCustom">
          <v-text-field
            v-model="customForm.name"
            label="Peptide name"
            placeholder="e.g. Epitalon"
          />

          <div>
            <p class="pc-label">Vial unit</p>
            <v-btn-toggle
              v-model="customForm.vialUnit"
              mandatory
              density="comfortable"
              aria-label="Custom vial unit"
            >
              <v-btn value="mg">mg</v-btn>
              <v-btn value="iu">IU</v-btn>
            </v-btn-toggle>
          </div>

          <v-text-field
            v-model="customForm.vialAmount"
            label="Peptide in vial (optional)"
            :suffix="unitLabel(customForm.vialUnit)"
            type="number"
            inputmode="decimal"
            :rules="[rules.optionalPositive]"
            hint="Leave blank to enter on the calculator."
            persistent-hint
          />
        </v-form>

        <v-form v-else class="pc-stack" @submit.prevent="submitBlend">
          <v-text-field
            v-model="blendForm.name"
            label="Blend name"
            placeholder="e.g. CJC-1295 + Ipamorelin"
            hint="Leave blank to name it from its components."
            persistent-hint
          />

          <div class="pc-stack pc-stack--tight">
            <p class="pc-label">Components per vial</p>
            <div
              v-for="(row, i) in blendForm.components"
              :key="row.id"
              :class="[
                'picker__component-row',
                { 'picker__component-row--removable': blendForm.components.length > 2 },
              ]"
            >
              <v-text-field
                v-model="row.name"
                :list="suggestionsId"
                :label="`Component ${i + 1}`"
                placeholder="Peptide name"
                :rules="[rules.required]"
              />
              <v-text-field
                v-model="row.amountMg"
                label="Amount"
                suffix="mg"
                type="number"
                inputmode="decimal"
                :rules="[rules.positive]"
                class="picker__component-amount"
              />
              <v-btn
                v-if="blendForm.components.length > 2"
                :icon="mdiDeleteOutline"
                variant="text"
                :aria-label="`Remove component ${i + 1}`"
                class="picker__component-remove"
                @click="removeComponent(i)"
              />
            </div>

            <div class="d-flex flex-wrap align-center justify-space-between ga-2">
              <v-btn
                v-if="blendForm.components.length < MAX_COMPONENTS"
                variant="tonal"
                size="small"
                :prepend-icon="mdiPlus"
                @click="addComponent"
              >
                Add component
              </v-btn>
              <span class="text-body-small pc-muted pc-num">
                Total per vial: <strong>{{ blendTotal }} mg</strong>
              </span>
            </div>
            <p class="text-body-small pc-faint">
              Catalog peptides in a blend carry their own mixing notes and vial limits.
            </p>
            <datalist :id="suggestionsId">
              <option v-for="name in singlePeptideNames" :key="name" :value="name" />
            </datalist>
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          v-if="mode === 'custom'"
          color="primary"
          variant="flat"
          :disabled="!customValid"
          @click="submitCustom"
        >
          Use custom peptide
        </v-btn>
        <v-btn
          v-else-if="mode === 'blend'"
          color="primary"
          variant="flat"
          :disabled="!blendValid"
          @click="submitBlend"
        >
          Use custom blend
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.picker__modes {
  padding: 0 24px 12px;
}

.picker__list {
  background: transparent;
  padding: 0;
}

.picker__item-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.picker__component-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 136px;
  gap: 10px;
  align-items: start;
}

.picker__component-row--removable {
  grid-template-columns: minmax(0, 1fr) 124px auto;
}

.picker__component-amount {
  min-width: 0;
}

.picker__component-remove {
  margin-top: var(--pc-field-label-band);
}
</style>
