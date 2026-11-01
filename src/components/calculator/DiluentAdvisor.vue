<script setup lang="ts">
import { computed, watch } from 'vue'
import { useDiluentAdvisor, type MixContext } from '@/composables/useDiluentAdvisor'
import type { InjectionSiteNote } from '@/domain/catalog'
import type { Concentration } from '@/domain/reconstitution'
import type { DiluentOption, DiluentProblem, MarkFit } from '@/domain/diluent'
import { scaleLabel, type SyringeReading } from '@/domain/syringe'
import { formatQuantity, roundTo, unitLabel, type Quantity } from '@/domain/units'
import PresetPicker from '@/components/common/PresetPicker.vue'
import SourceBadge from '@/components/common/SourceBadge.vue'

const props = defineProps<{ context: MixContext; dose: Quantity | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ choose: [waterMl: number] }>()

const advisor = useDiluentAdvisor(() => props.context)
const { state } = advisor

// Start from the calculator's dose each time, so an abandoned range never leaks into the next visit.
watch(
  open,
  (isOpen) => {
    if (isOpen) advisor.actions.reset(props.dose)
  },
  { immediate: true },
)

const VIAL_SIZES_ML = [2, 3, 5, 10]

const mixLabel = computed(() => {
  const { peptide, vial, syringe } = props.context
  const name = peptide?.name ?? 'Custom peptide'
  return vial ? `${name} · ${formatQuantity(vial)} · ${syringe.label}` : name
})

const doseRangeLabel = computed(() => {
  const unit = unitLabel(state.doseUnit)
  const { lowDose: a, highDose: b } = state
  if (!a) return ''
  return b && b !== a ? `${Math.min(a, b)} to ${Math.max(a, b)} ${unit}` : `${a} ${unit}`
})

function parseDose(text: string): number | null {
  const n = Number.parseFloat(text)
  return Number.isFinite(n) && n > 0 ? n : null
}

const sourceKinds = (note: InjectionSiteNote) => [...new Set(note.sources.map((s) => s.kind))]

const strength = (c: Concentration) => `${formatQuantity({ value: c.perMl, unit: c.unit })}/mL`

/** A reading, or a range of readings when the planned doses differ. */
function readingRange(low: SyringeReading, high: SyringeReading): string {
  if (Math.abs(low.scaleValue - high.scaleValue) < 1e-9) return scaleLabel(low)
  return `${roundTo(low.scaleValue, low.scaleUnit === 'units' ? 2 : 3)}–${scaleLabel(high)}`
}

const drawLabel = (o: DiluentOption) => readingRange(o.low, o.high)

function tagsFor(o: DiluentOption) {
  const tags: { text: string; tone: string }[] = []
  if (o === advisor.best.value) tags.push({ text: 'Recommended', tone: 'brand' })
  if (o.gentle === true) tags.push({ text: 'Gentler', tone: 'good' })
  if (o.gentle === false) {
    tags.push(
      o.topUp ? { text: 'Top up to dilute', tone: 'info' } : { text: 'May sting', tone: 'notice' },
    )
  }
  if (!o.fitsVial) tags.push({ text: 'Needs a larger vial', tone: 'notice' })
  if (o.marks === 'between') tags.push({ text: 'Between marks', tone: 'notice' })
  return tags
}

const PROBLEMS: Record<DiluentProblem, string> = {
  'too-large':
    "Your largest dose doesn't fit in one syringe at any dilution. Choose a larger syringe.",
  'too-small':
    'Your smallest dose is under one mark on this syringe, even at 10 mL. Choose a finer syringe.',
  'range-too-wide':
    'No single volume works for both your smallest and largest dose. Narrow the range or change syringe.',
  'more-than-vial': 'Your largest dose is more than this vial contains.',
}

const problem = computed(() => {
  const p = advisor.advice.value?.problem
  return p ? PROBLEMS[p] : advisor.error.value
})

const MARK_PHRASE: Record<MarkFit, string> = {
  on: 'on a mark',
  near: 'close to a mark',
  between: 'as near a mark as this syringe allows',
}

/** Why the recommendation won, stated from its actual result rather than its intent. */
const reason = computed(() => {
  const b = advisor.best.value
  if (!b) return ''
  const vial = b.fitsVial ? 'Fits your vial' : 'Needs a larger vial'
  return `${vial}, keeps each dose in one syringe and ${MARK_PHRASE[b.marks]}, and is as dilute as that allows.`
})

/** The gentler volume, rounded up to a measurable half mL, when the vial cannot hold it. */
const gentlerNeedsMl = computed(() => {
  const min = advisor.advice.value?.gentleMinMl
  if (min == null || !state.vialCapacityMl || min <= state.vialCapacityMl + 1e-9) return null
  return Math.ceil(min * 2 - 1e-9) / 2
})

function choose() {
  if (!advisor.selected.value) return
  emit('choose', advisor.selected.value.waterMl)
  open.value = false
}
</script>

<template>
  <v-bottom-sheet v-model="open" inset scrollable max-width="640">
    <v-card class="advisor">
      <v-card-item>
        <p class="pc-eyebrow">Mixing advisor</p>
        <v-card-title>How much water to add</v-card-title>
        <v-card-subtitle class="pc-num advisor__subtitle">{{ mixLabel }}</v-card-subtitle>
      </v-card-item>

      <v-card-text class="pc-stack">
        <fieldset class="advisor__fieldset">
          <legend class="pc-label">Doses you plan to draw</legend>
          <div class="pc-stack pc-stack--tight">
            <div class="d-flex ga-3">
              <v-text-field
                :model-value="state.lowDose ?? ''"
                label="Dose"
                :suffix="unitLabel(state.doseUnit)"
                type="number"
                inputmode="decimal"
                hide-details
                @update:model-value="state.lowDose = parseDose($event)"
              />
              <v-text-field
                :model-value="state.highDose ?? ''"
                label="Up to"
                placeholder="Same"
                persistent-placeholder
                :suffix="unitLabel(state.doseUnit)"
                type="number"
                inputmode="decimal"
                hide-details
                @update:model-value="state.highDose = parseDose($event)"
              />
            </div>
            <div class="d-flex flex-wrap align-center ga-3">
              <v-btn-toggle
                v-if="advisor.doseUnits.value.length > 1"
                :model-value="state.doseUnit"
                mandatory
                density="compact"
                aria-label="Dose unit"
                @update:model-value="advisor.actions.setDoseUnit($event)"
              >
                <v-btn v-for="u in advisor.doseUnits.value" :key="u" :value="u">{{
                  unitLabel(u)
                }}</v-btn>
              </v-btn-toggle>
              <span class="text-body-small pc-faint">Add a top dose if you'll titrate.</span>
            </div>
          </div>
        </fieldset>

        <PresetPicker
          v-model="state.vialCapacityMl"
          input-id="vial-capacity"
          label="Vial size"
          :presets="VIAL_SIZES_ML"
          unit-label="mL"
          hint="How much the glass vial holds."
        />
        <section aria-label="Water volumes" aria-live="polite" class="pc-stack">
          <v-alert v-if="problem" type="warning" variant="tonal" density="compact">
            {{ problem }}
          </v-alert>

          <template v-else-if="advisor.selected.value">
            <div>
              <div class="advisor__headline">
                <span class="pc-muted">Add</span>
                <span class="advisor__value pc-num" data-testid="advisor-water">{{
                  advisor.selected.value.waterMl
                }}</span>
                <span class="advisor__unit">mL</span>
              </div>
              <p class="pc-muted pc-num">
                {{ strength(advisor.selected.value.concentration) }} · {{ doseRangeLabel }} draws
                {{ drawLabel(advisor.selected.value) }}
              </p>
            </div>
            <p
              v-if="advisor.selected.value.topUp"
              class="pc-inset pa-3 text-body-medium"
              data-testid="advisor-top-up"
            >
              To reduce stinging, draw the dose, then pull water into the same syringe up to
              <strong class="pc-num">{{
                readingRange(advisor.selected.value.topUp.low, advisor.selected.value.topUp.high)
              }}</strong
              >.
            </p>

            <div role="radiogroup" aria-label="Water to add" class="advisor__options">
              <button
                v-for="o in advisor.options.value"
                :key="o.waterMl"
                type="button"
                role="radio"
                :aria-checked="o === advisor.selected.value"
                :class="[
                  'advisor__option',
                  { 'advisor__option--on': o === advisor.selected.value },
                ]"
                @click="advisor.actions.select(o.waterMl)"
              >
                <span class="advisor__water pc-num">{{ o.waterMl }} mL</span>
                <span class="pc-num pc-muted">{{ strength(o.concentration) }}</span>
                <span class="pc-num text-end">{{ drawLabel(o) }}</span>
                <span class="advisor__tags">
                  <span
                    v-for="t in tagsFor(o)"
                    :key="t.text"
                    :class="['pc-badge', `pc-badge--${t.tone}`]"
                    ><span class="pc-badge__dot" />{{ t.text }}</span
                  >
                </span>
              </button>
            </div>

            <p class="text-body-small pc-faint">
              {{ reason }}
              <template v-if="gentlerNeedsMl">
                A gentler mix needs {{ gentlerNeedsMl }} mL, more than the vial holds.
              </template>
            </p>
          </template>

          <p v-else class="pc-muted">Enter your dose above.</p>
        </section>

        <section
          v-for="c in advisor.concerns.value"
          :key="c.name"
          class="pc-inset pa-3"
          :aria-label="`${c.name} at the injection site`"
        >
          <p class="pc-label">{{ c.name }} at the injection site</p>
          <p class="text-body-small mb-2">
            {{ c.note.note }}
            <template v-if="c.note.maxMgPerMl">
              PepCalc aims for
              <strong class="pc-num">{{ c.note.maxMgPerMl }} mg/mL</strong> or weaker, below where
              users report stinging.
            </template>
          </p>
          <details>
            <summary>
              <span class="advisor__badges">
                <SourceBadge v-for="kind in sourceKinds(c.note)" :key="kind" :kind="kind" />
              </span>
            </summary>
            <ul class="advisor__sources text-body-small">
              <li v-for="s in c.note.sources" :key="s.citation">
                <a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{
                  s.citation
                }}</a>
                <span v-else class="pc-muted">{{ s.citation }}</span>
              </li>
            </ul>
          </details>
        </section>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!advisor.selected.value" @click="choose">
          {{ advisor.selected.value ? `Use ${advisor.selected.value.waterMl} mL` : 'Use' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.advisor__subtitle {
  white-space: normal;
}

.advisor__fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.advisor__badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  vertical-align: middle;
}

.advisor__sources {
  margin: 8px 0 0;
  padding-left: 18px;
}

.advisor__headline {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.advisor__value {
  font-size: clamp(2.5rem, 10vw, 3.5rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.advisor__unit {
  font-size: 1.25rem;
  font-weight: 600;
}

.advisor__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* One row per volume: water, strength and draw line up across rows for comparison. */
.advisor__option {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 12px;
  min-height: var(--pc-touch);
  padding: 10px 14px;
  border: 1px solid var(--pc-divider);
  border-radius: var(--pc-radius-md);
  background: var(--pc-surface);
  color: var(--pc-text-1);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color var(--pc-dur-fast) var(--pc-ease-standard);
}

.advisor__option:focus-visible {
  outline: none;
  box-shadow: var(--pc-shadow-focus);
}

.advisor__option--on {
  border-color: var(--pc-brand);
  background: var(--pc-brand-softer);
}

.advisor__water {
  font-weight: 700;
}

.advisor__tags {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.advisor__tags:empty {
  display: none;
}

summary {
  cursor: pointer;
  min-height: 32px;
}
</style>
