<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { roundTo } from '@/domain/units'

const props = withDefaults(
  defineProps<{
    label: string
    presets: readonly number[]
    unitLabel: string
    /** Shown under the chips, e.g. the source of the presets. */
    hint?: string
    min?: number
    step?: number
    inputId: string
  }>(),
  { hint: undefined, min: 0, step: 0.01 },
)

const model = defineModel<number | null>({ required: true })

const CUSTOM = -1
const isPreset = (v: number | null) => v !== null && props.presets.includes(v)

/*
 * Custom mode is explicit (the user tapped "Custom") or implied (the value is not a preset).
 * Selection is derived from the value and the preset list together, because a parent can
 * change both in the same tick (switching peptide swaps presets and the default dose).
 */
const customMode = ref(false)
const customText = ref('')

const selected = computed(() => {
  if (customMode.value) return CUSTOM
  if (isPreset(model.value)) return model.value
  return model.value === null ? null : CUSTOM
})

watch(
  [model, () => props.presets],
  ([value]) => {
    if (isPreset(value)) {
      customMode.value = false
    } else if (value !== null && String(value) !== customText.value) {
      customText.value = String(value)
    }
  },
  { immediate: true },
)

function choose(value: unknown) {
  // Tapping the selected chip again would clear the group; keep the current selection instead.
  if (typeof value !== 'number') return
  if (value === CUSTOM) {
    customMode.value = true
    if (model.value !== null) customText.value = String(model.value)
    return
  }
  customMode.value = false
  model.value = value
}

function onCustomInput(text: string) {
  customText.value = text
  const parsed = Number.parseFloat(text)
  model.value = Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const customError = computed(() => {
  if (selected.value !== CUSTOM || customText.value === '') return undefined
  const parsed = Number.parseFloat(customText.value)
  return Number.isFinite(parsed) && parsed > 0 ? undefined : 'Enter a number greater than 0'
})
</script>

<template>
  <!-- Named by the label alone so a button in the action slot is not read as part of it. -->
  <fieldset class="preset-picker" :aria-labelledby="`${inputId}-label`">
    <legend class="preset-picker__legend">
      <span :id="`${inputId}-label`" class="pc-label">{{ label }}</span>
      <slot name="action" />
    </legend>
    <v-chip-group :model-value="selected" color="primary" column @update:model-value="choose">
      <v-chip
        v-for="value in presets"
        :key="value"
        :value="value"
        :aria-pressed="selected === value"
        tag="button"
        class="pc-num"
        filter
        size="large"
      >
        {{ roundTo(value, 4) }} {{ unitLabel }}
      </v-chip>
      <v-chip :value="CUSTOM" :aria-pressed="selected === CUSTOM" tag="button" filter size="large">
        Custom
      </v-chip>
    </v-chip-group>
    <v-expand-transition>
      <div v-if="selected === CUSTOM" class="preset-picker__custom">
        <v-text-field
          :id="inputId"
          :model-value="customText"
          :label="`Custom ${label.toLowerCase()}`"
          :suffix="unitLabel"
          :error-messages="customError"
          :min="min"
          :step="step"
          type="number"
          inputmode="decimal"
          autocomplete="off"
          @update:model-value="onCustomInput"
        />
      </div>
    </v-expand-transition>
    <p v-if="hint" class="preset-picker__hint pc-faint">{{ hint }}</p>
  </fieldset>
</template>

<style scoped>
.preset-picker {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.preset-picker__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  width: 100%;
  margin-bottom: 6px;
}

/* The row owns the gap below; a margin on the label alone would lift it off the button's centre. */
.preset-picker__legend > .pc-label {
  margin-bottom: 0;
}

.preset-picker__custom {
  max-width: 320px;
  padding-top: 4px;
}

.preset-picker__hint {
  font-size: 0.8125rem;
  margin-top: 2px;
}

.preset-picker :deep(.v-chip) {
  min-height: 40px;
}
</style>
