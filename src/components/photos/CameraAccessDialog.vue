<script setup lang="ts">
import { useId } from 'vue'
import type { CameraAccess } from '@/services/photos/cameraAccess'
import { systemName } from '@/services/platform'
import { mdiCameraOffOutline, mdiCameraOutline, mdiLockOutline } from '@/plugins/icons'

/** Why the camera is needed, before the system asks; or how to turn it back on after a refusal. */
defineProps<{ access: CameraAccess }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ allow: []; settings: []; library: [] }>()

const titleId = useId()
</script>

<template>
  <v-dialog v-model="open" max-width="440" :aria-labelledby="titleId">
    <v-card>
      <v-card-text v-if="access === 'denied'" class="pc-stack pc-stack--loose">
        <div class="camera-access__hero">
          <span class="camera-access__badge camera-access__badge--off">
            <v-icon :icon="mdiCameraOffOutline" size="32" />
          </span>
          <h2 :id="titleId" class="text-title-large pc-display">Camera is off for PepCalc</h2>
          <p class="pc-muted">Turn it on in {{ systemName }} settings, then come back.</p>
        </div>
        <div class="pc-stack pc-stack--tight">
          <v-btn color="primary" variant="flat" size="large" block @click="emit('settings')">
            Open settings
          </v-btn>
          <v-btn variant="text" block @click="emit('library')">Choose a photo instead</v-btn>
        </div>
      </v-card-text>
      <v-card-text v-else class="pc-stack pc-stack--loose">
        <div class="camera-access__hero">
          <span class="camera-access__badge"><v-icon :icon="mdiCameraOutline" size="32" /></span>
          <h2 :id="titleId" class="text-title-large pc-display">Allow the camera</h2>
        </div>
        <ul class="camera-access__points">
          <li>
            <v-icon :icon="mdiCameraOutline" size="20" />
            <span>Used only when you tap Take a photo.</span>
          </li>
          <li>
            <v-icon :icon="mdiLockOutline" size="20" />
            <span>Photos stay on this device unless you share them.</span>
          </li>
        </ul>
        <div class="pc-stack pc-stack--tight">
          <v-btn color="primary" variant="flat" size="large" block @click="emit('allow')">
            Allow camera
          </v-btn>
          <v-btn variant="text" block @click="open = false">Not now</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.camera-access__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.camera-access__badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--pc-radius-pill);
  color: var(--pc-brand);
  background: var(--pc-brand-soft);
}

.camera-access__badge--off {
  color: var(--pc-text-2);
  background: var(--pc-surface-sunk);
}

.camera-access__points {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.camera-access__points li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
</style>
