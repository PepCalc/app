<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { catalog } from '@/data'
import { CUSTOM_PEPTIDE, useCalculator } from '@/composables/useCalculator'
import { useNow } from '@/composables/useNow'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { useNotifyStore } from '@/stores/notify'
import { roundTo, unitLabel } from '@/domain/units'
import type { DoseEvent } from '@/domain/pk'
import { nowIso } from '@/services/time'
import PresetPicker from '@/components/common/PresetPicker.vue'
import SourceBadge from '@/components/common/SourceBadge.vue'
import DrawResult from '@/components/calculator/DrawResult.vue'
import DiluentAdvisor from '@/components/calculator/DiluentAdvisor.vue'
import type { MixContext } from '@/composables/useDiluentAdvisor'
import PkPanel from '@/components/charts/PkPanel.vue'
import { mdiBookshelf, mdiNeedle, mdiWaterPlusOutline } from '@/plugins/icons'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const shelf = useShelfStore()
const notify = useNotifyStore()
const now = useNow()

const calc = useCalculator({ syringeId: settings.defaultSyringeId })
const { state } = calc

const peptideItems = [
  ...catalog.peptides.map((p) => ({
    title: p.name,
    value: p.id,
    subtitle: p.kind === 'blend' ? 'Blend' : p.aliases.slice(0, 2).join(', '),
  })),
  { title: 'Custom peptide', value: CUSTOM_PEPTIDE, subtitle: 'Enter your own values' },
]

/** A shelf vial selected with ?vial=<id>; its amount and water are fixed. */
const shelfVial = computed(() => {
  const id = route.query.vial
  return typeof id === 'string' ? shelf.vialById(id) : undefined
})

/*
 * Load the vial's values once per vial id. Logging a draw reloads the shelf and replaces the
 * vial object; reacting to that would reset the dose the user is entering. The dose and syringe
 * start from the last draw (see startingDose).
 */
watch(
  () => shelfVial.value?.id,
  () => {
    const vial = shelfVial.value
    if (!vial) return
    const { dose, syringeId } = shelf.drawDefaultsFor(vial)
    calc.actions.selectPeptide(vial.peptideId ?? CUSTOM_PEPTIDE)
    Object.assign(state, {
      customName: vial.peptideId ? '' : vial.name,
      vialAmount: vial.amount,
      vialUnit: vial.unit,
      diluentMl: vial.diluentMl,
      components: vial.components?.map((c) => ({ ...c })) ?? [],
      doseValue: dose?.value ?? state.doseValue,
      doseUnit: dose?.unit ?? state.doseUnit,
      syringeId: syringeId ?? state.syringeId,
    })
  },
  { immediate: true },
)

watch(
  () => settings.defaultSyringeId,
  (id) => {
    state.syringeId = id
  },
)

const advising = ref(false)
const mixContext = computed<MixContext>(() => ({
  peptide: calc.peptide.value,
  components: state.components,
  vial: calc.vial.value,
  syringe: calc.syringe.value,
}))

const doseHint = computed(() => {
  const lastDrawn = shelfVial.value ? shelf.startingDoseHint(shelfVial.value, now.value) : null
  if (lastDrawn) return lastDrawn
  const doses = calc.peptide.value?.doses
  if (!doses) return 'No established dose. Enter your own.'
  return undefined
})

const balance = computed(() => (shelfVial.value ? shelf.balanceOf(shelfVial.value) : null))

/** Logged doses of this peptide from every vial, in the dose unit being entered. */
const pooled = computed(() =>
  shelfVial.value
    ? shelf.pooledDosesFor(shelfVial.value, state.doseUnit)
    : { doses: [], vialCount: 0 },
)
const pooledCaption = computed(() =>
  pooled.value.vialCount > 1 ? `Includes doses from ${pooled.value.vialCount} vials.` : undefined,
)

const previewDose = computed<DoseEvent | null>(() =>
  calc.dose.value ? { at: now.value, amount: calc.dose.value.value } : null,
)

async function saveToShelf() {
  if (!calc.vial.value || !state.diluentMl) return
  const p = calc.peptide.value
  const vial = await shelf.addVial({
    peptideId: p?.id ?? null,
    name: p?.name ?? (state.customName.trim() || 'Custom peptide'),
    kind: calc.isBlend.value ? 'blend' : 'single',
    unit: state.vialUnit,
    amount: calc.vial.value.value,
    diluentMl: state.diluentMl,
    components: calc.isBlend.value ? state.components.map((c) => ({ ...c })) : null,
    typicalDose: calc.dose.value,
    pkOverride: null,
    reconstitutedAt: nowIso(),
    status: 'active',
    notes: '',
  })
  notify.show(`${shelf.displayName(vial)} added to your shelf`, 'success')
  await router.replace({ name: 'calculator', query: { vial: vial.id } })
}

async function logDraw() {
  const vial = shelfVial.value
  const dose = calc.dose.value
  if (!vial || !calc.plan.value || !dose) return
  await shelf.addDraw({
    vialId: vial.id,
    takenAt: nowIso(),
    dose,
    volumeMl: calc.plan.value.volumeMl,
    syringeId: state.syringeId,
    notes: '',
  })
  notify.show(
    `Logged ${roundTo(dose.value, 4)} ${unitLabel(dose.unit)} of ${shelf.displayName(vial)}`,
    'success',
  )
}

function clearShelfVial() {
  void router.replace({ name: 'calculator' })
}
</script>

<template>
  <div class="pc-page">
    <header class="mb-4">
      <p class="pc-eyebrow">Peptide calculator</p>
      <h1 class="pc-display text-headline-large">How much to draw</h1>
    </header>

    <div class="calc-layout">
      <section class="calc-inputs" aria-label="Inputs">
        <v-card v-if="shelfVial" class="pc-card-soft">
          <v-card-item>
            <p class="pc-eyebrow">From your shelf</p>
            <v-card-title>{{ shelf.displayName(shelfVial) }}</v-card-title>
            <v-card-subtitle class="pc-num">
              {{ shelfVial.amount }} {{ unitLabel(shelfVial.unit) }} in {{ shelfVial.diluentMl }} mL
              <template v-if="balance">
                · {{ roundTo(balance.remainingAmount, 3) }} {{ unitLabel(shelfVial.unit) }} left
              </template>
            </v-card-subtitle>
          </v-card-item>
          <v-card-actions>
            <v-btn :to="{ name: 'vial', params: { id: shelfVial.id } }" variant="text"
              >Open vial</v-btn
            >
            <v-btn variant="text" @click="clearShelfVial">Use a different peptide</v-btn>
          </v-card-actions>
        </v-card>

        <v-card v-else>
          <v-card-item>
            <p class="pc-eyebrow">1 · Peptide</p>
          </v-card-item>
          <v-card-text class="pc-stack">
            <v-select
              :model-value="state.peptideId"
              :items="peptideItems"
              item-title="title"
              item-value="value"
              label="Peptide"
              @update:model-value="calc.actions.selectPeptide($event as string)"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="item.subtitle" />
              </template>
            </v-select>
            <v-text-field
              v-if="state.peptideId === CUSTOM_PEPTIDE"
              v-model="state.customName"
              label="Name"
              placeholder="e.g. Ipamorelin"
            />
            <p v-if="calc.peptide.value" class="text-body-medium pc-muted">
              {{ calc.peptide.value.summary }}
            </p>
          </v-card-text>
        </v-card>

        <v-card v-if="!shelfVial">
          <v-card-item>
            <p class="pc-eyebrow">2 · Vial</p>
          </v-card-item>
          <v-card-text class="pc-stack">
            <template v-if="calc.isBlend.value">
              <div class="pc-stack pc-stack--tight">
                <p class="pc-label">Composition per vial</p>
                <v-text-field
                  v-for="(c, i) in state.components"
                  :key="c.name"
                  v-model.number="state.components[i]!.amountMg"
                  :label="`${c.name} amount`"
                  suffix="mg"
                  type="number"
                  inputmode="decimal"
                  class="calc-component-amount"
                />
                <p class="text-body-small pc-faint">
                  Vendor compositions differ. Match these to your vial's label. Total:
                  <strong class="pc-num">{{ state.vialAmount }} mg</strong>
                </p>
              </div>
            </template>
            <template v-else>
              <PresetPicker
                v-model="state.vialAmount"
                input-id="vial-amount"
                label="Peptide in vial"
                :presets="calc.peptide.value?.vialSizes.values ?? []"
                :unit-label="unitLabel(state.vialUnit)"
                :hint="calc.peptide.value ? 'Use the amount printed on your vial.' : undefined"
              />
              <v-btn-toggle
                v-if="state.peptideId === CUSTOM_PEPTIDE"
                v-model="state.vialUnit"
                mandatory
                density="comfortable"
                aria-label="Vial unit"
              >
                <v-btn value="mg">mg</v-btn>
                <v-btn value="iu">IU</v-btn>
              </v-btn-toggle>
            </template>

            <PresetPicker
              v-model="state.diluentMl"
              input-id="diluent"
              label="Bacteriostatic water added"
              :presets="calc.peptide.value?.diluentMl.values ?? [1, 2, 3, 5]"
              unit-label="mL"
              hint="More water makes small doses easier to measure but increases each dose's volume."
            >
              <template #action>
                <v-btn
                  variant="tonal"
                  size="small"
                  :prepend-icon="mdiWaterPlusOutline"
                  :disabled="!calc.vial.value"
                  @click="advising = true"
                >
                  Help me choose
                </v-btn>
              </template>
            </PresetPicker>
          </v-card-text>
          <v-card-actions>
            <v-btn
              color="primary"
              variant="tonal"
              size="large"
              :prepend-icon="mdiBookshelf"
              :disabled="!calc.vial.value || !state.diluentMl"
              @click="saveToShelf"
            >
              Save vial to shelf
            </v-btn>
            <span class="text-body-small pc-faint">Track this vial and log draws.</span>
          </v-card-actions>
        </v-card>

        <v-card>
          <v-card-item>
            <p class="pc-eyebrow">{{ shelfVial ? 'Dose' : '3 · Dose' }}</p>
          </v-card-item>
          <v-card-text class="pc-stack">
            <v-btn-toggle
              v-if="calc.doseUnits.value.length > 1"
              :model-value="state.doseUnit"
              mandatory
              density="comfortable"
              aria-label="Dose unit"
              @update:model-value="calc.actions.setDoseUnit($event)"
            >
              <v-btn v-for="u in calc.doseUnits.value" :key="u" :value="u">{{
                unitLabel(u)
              }}</v-btn>
            </v-btn-toggle>
            <PresetPicker
              v-model="state.doseValue"
              input-id="dose"
              label="Dose"
              :presets="
                calc.peptide.value?.doses && calc.peptide.value.doses.unit === state.doseUnit
                  ? calc.peptide.value.doses.values
                  : []
              "
              :unit-label="unitLabel(state.doseUnit)"
              :hint="doseHint"
            />
            <div
              v-if="calc.peptide.value?.doses && calc.peptide.value.doses.unit === state.doseUnit"
              class="d-flex flex-wrap ga-2 align-center"
            >
              <SourceBadge :kind="calc.peptide.value.doses.source.kind" />
              <a
                v-if="calc.peptide.value.doses.source.url"
                :href="calc.peptide.value.doses.source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-body-small"
                >{{ calc.peptide.value.doses.source.citation }}</a
              >
              <span v-else class="text-body-small pc-muted">{{
                calc.peptide.value.doses.source.citation
              }}</span>
            </div>
          </v-card-text>
        </v-card>
      </section>

      <section class="calc-output" aria-label="Result">
        <DrawResult
          v-if="calc.plan.value && calc.reading.value && calc.dose.value"
          v-model:syringe-id="state.syringeId"
          :plan="calc.plan.value"
          :reading="calc.reading.value"
          :all-readings="calc.allReadings.value"
          :warnings="calc.warnings.value"
          :component-doses="calc.componentDoses.value"
          :better-syringe="calc.betterSyringe.value"
          :dose="calc.dose.value"
        />
        <v-card v-else variant="tonal">
          <v-card-text class="pc-muted">
            <template v-if="calc.error.value">{{ calc.error.value }}</template>
            <template v-else>Enter the vial amount, water and dose.</template>
          </v-card-text>
        </v-card>

        <div v-if="calc.plan.value && shelfVial" class="d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            variant="flat"
            size="large"
            :prepend-icon="mdiNeedle"
            @click="logDraw"
          >
            Log this draw now
          </v-btn>
        </div>

        <PkPanel
          v-if="calc.dose.value"
          :peptide="calc.peptide.value"
          :override="shelfVial?.pkOverride ?? null"
          :doses="pooled.doses"
          :preview="previewDose"
          :unit-label="unitLabel(state.doseUnit)"
          :now="now"
          :caption="pooledCaption"
        />
      </section>
    </div>

    <DiluentAdvisor
      v-model="advising"
      :context="mixContext"
      :dose="calc.dose.value"
      @choose="state.diluentMl = $event"
    />
  </div>
</template>

<style scoped>
.calc-layout {
  display: grid;
  gap: 16px;
}

.calc-inputs,
.calc-output {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Tablets and up: inputs on the left, the answer beside them. */
@media (min-width: 840px) {
  .calc-layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
  }
}

.calc-component-amount {
  max-width: 180px;
}
</style>
