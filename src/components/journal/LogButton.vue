<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { mdiPlus } from '@/plugins/icons'
import { useLogStore } from '@/stores/log'

/** Primary action across every screen: opens the Log bottom sheet. */
const log = useLogStore()
const display = useDisplay()
const wide = computed(() => display.mdAndUp.value)
</script>

<template>
  <div :class="['log-button', wide ? 'log-button--rail' : 'log-button--phone']">
    <v-fab
      extended
      color="primary"
      :prepend-icon="mdiPlus"
      text="Log"
      aria-label="Log"
      @click="log.openSheet()"
    />
  </div>
</template>

<style scoped>
.log-button {
  position: fixed;
  z-index: 1006;
}

.log-button--phone {
  inset-inline-end: calc(16px + var(--safe-area-inset-right, env(safe-area-inset-right)));
  bottom: calc(64px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)) + 16px);
}

.log-button--rail {
  top: calc(
    var(--v-layout-top, 48px) + var(--safe-area-inset-top, env(safe-area-inset-top)) + 16px
  );
  inset-inline-start: 4px;
  width: 88px;
  display: flex;
  justify-content: center;
}
</style>
