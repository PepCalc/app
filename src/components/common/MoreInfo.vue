<script setup lang="ts">
import { ref, useId } from 'vue'
import { mdiChevronDown, mdiChevronUp } from '@/plugins/icons'

/** A chart's notes and sources, folded away so the chart stands on its own. */
const props = withDefaults(defineProps<{ label?: string; lazy?: boolean }>(), {
  label: 'More information',
  lazy: false,
})
const open = ref(false)
const panelId = useId()
</script>

<template>
  <div>
    <v-btn
      variant="text"
      size="small"
      :append-icon="open ? mdiChevronUp : mdiChevronDown"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      {{ props.label }}
    </v-btn>
    <v-expand-transition>
      <div v-if="!props.lazy || open" v-show="open" :id="panelId">
        <div class="pc-stack pc-stack--tight pt-2"><slot /></div>
      </div>
    </v-expand-transition>
  </div>
</template>
