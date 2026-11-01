<script setup lang="ts">
import { computed, ref } from 'vue'
import { syringeCatalog } from '@/data'
import type { ComponentDose } from '@/domain/blend'
import { formatConcentration, type DrawPlan } from '@/domain/reconstitution'
import { scaleLabel, scaleParts, type SyringeReading, type SyringeSpec } from '@/domain/syringe'
import { AMOUNT_DECIMALS, formatQuantity, roundTo, type Quantity } from '@/domain/units'
import type { CalculatorWarning } from '@/composables/useCalculator'
import { mdiShareVariantOutline } from '@/plugins/icons'
import SyringeGraphic from './SyringeGraphic.vue'

const props = defineProps<{
  plan: DrawPlan
  reading: SyringeReading
  allReadings: SyringeReading[]
  warnings: CalculatorWarning[]
  componentDoses: ComponentDose[]
  betterSyringe: SyringeSpec | null
  dose: Quantity
}>()

const syringeId = defineModel<string>('syringeId', { required: true })
defineEmits<{ share: [] }>()

const headline = computed(() => scaleParts(props.reading))
const concentrationText = computed(() => formatConcentration(props.plan.concentration))

/*
 * A dismissed suggestion stays hidden while this result is on screen. It is keyed on the
 * suggested syringe, so a different, better fit after the inputs change is still offered.
 */
const dismissedSuggestionId = ref<string | null>(null)
const suggestion = computed(() =>
  props.betterSyringe && props.betterSyringe.id !== dismissedSuggestionId.value
    ? props.betterSyringe
    : null,
)

const syringeItems = syringeCatalog.syringes.map((s) => ({ title: s.label, value: s.id }))
</script>

<template>
  <v-card class="draw-result" aria-live="polite">
    <v-card-item>
      <template #append>
        <v-btn
          :icon="mdiShareVariantOutline"
          variant="text"
          aria-label="Share draw as an image"
          @click="$emit('share')"
        />
      </template>
      <p class="pc-eyebrow">Draw</p>
      <div class="draw-result__headline">
        <span class="draw-result__value pc-num" data-testid="draw-headline">{{
          headline.value
        }}</span>
        <span class="draw-result__unit">{{ headline.unit }}</span>
      </div>
      <p class="pc-muted pc-num">
        <strong>{{ roundTo(plan.volumeMl, 3) }} mL</strong> for {{ formatQuantity(dose) }} on a
        {{ reading.syringe.label }}
      </p>
    </v-card-item>

    <v-card-text class="pc-stack">
      <SyringeGraphic :syringe="reading.syringe" :volume-ml="plan.volumeMl" />

      <v-alert
        v-for="w in warnings"
        :key="w.text"
        :type="w.tone === 'alert' ? 'error' : 'warning'"
        variant="tonal"
        density="compact"
      >
        {{ w.text }}
      </v-alert>

      <v-alert v-if="suggestion" type="info" variant="tonal" density="compact">
        <div class="pc-stack pc-stack--tight">
          <span>A {{ suggestion.label }} has finer marks for this draw.</span>
          <div class="pc-actions">
            <v-btn variant="text" @click="dismissedSuggestionId = suggestion.id">Dismiss</v-btn>
            <v-btn variant="tonal" color="info" @click="syringeId = suggestion.id">Use it</v-btn>
          </div>
        </div>
      </v-alert>

      <v-select v-model="syringeId" :items="syringeItems" label="Syringe" />

      <dl class="draw-result__facts">
        <div>
          <dt class="pc-faint">Concentration</dt>
          <dd class="pc-num">{{ concentrationText }}</dd>
        </div>
        <div>
          <dt class="pc-faint">Doses per vial</dt>
          <dd class="pc-num">{{ plan.dosesPerVial }}</dd>
        </div>
        <div v-if="reading.fits && reading.tickRoundingError > 0.001">
          <dt class="pc-faint">Nearest mark</dt>
          <dd class="pc-num">
            {{ reading.nearestTickValue }} {{ reading.scaleUnit }}
            <span class="pc-faint">({{ Math.round(reading.tickRoundingError * 100) }}% off)</span>
          </dd>
        </div>
      </dl>

      <div v-if="componentDoses.length" class="pc-inset pa-3">
        <p class="pc-label">This draw contains</p>
        <ul class="draw-result__components">
          <li v-for="c in componentDoses" :key="c.name" class="pc-num">
            <span>{{ c.name }}</span>
            <span>{{ roundTo(c.dose.value, AMOUNT_DECIMALS.mcg) }} mcg</span>
          </li>
        </ul>
      </div>

      <details>
        <summary class="text-label-large">On every syringe</summary>
        <v-table density="compact" class="draw-result__table">
          <tbody>
            <tr v-for="r in allReadings" :key="r.syringe.id">
              <td>{{ r.syringe.label }}</td>
              <td class="text-end pc-num">
                <template v-if="!r.fits">over capacity</template>
                <template v-else-if="r.belowResolution">below one mark</template>
                <template v-else>{{ scaleLabel(r) }}</template>
              </td>
            </tr>
          </tbody>
        </v-table>
      </details>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.draw-result__headline {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0;
}

.draw-result__value {
  font-family: var(--pc-font);
  font-size: clamp(3rem, 12vw, 4.5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}

.draw-result__unit {
  font-size: 1.25rem;
  font-weight: 600;
}

.draw-result__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0;
}

.draw-result__facts dt {
  font-size: 0.75rem;
  font-weight: 600;
}

.draw-result__facts dd {
  margin: 0;
  font-weight: 600;
}

.draw-result__components {
  list-style: none;
  padding: 0;
  margin: 0;
}

.draw-result__components li {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}

.draw-result__table {
  background: transparent;
}

summary {
  cursor: pointer;
  min-height: 32px;
}
</style>
