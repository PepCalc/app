<script setup lang="ts">
import { computed } from 'vue'
import type { VialAge } from '@/composables/useVialAge'
import { vialAgeText, type AgeTier } from '@/domain/vialAge'

const props = defineProps<{ age: VialAge }>()

const TONES: Record<AgeTier, string> = { fresh: 'good', nearing: 'notice', past: 'alert' }

/** The text carries the state, so the colour is never the only signal. */
const text = computed(() => vialAgeText(props.age))
</script>

<template>
  <span :class="['pc-badge', `pc-badge--${TONES[age.tier]}`, 'pc-num']">
    <span class="pc-badge__dot" />{{ text }}
  </span>
</template>
