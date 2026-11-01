<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PhotoRow } from '@/db/database'
import { POSE_LABELS } from '@/domain/photos'
import { usePaging } from '@/composables/usePaging'
import { useStoragePersistence } from '@/composables/useStoragePersistence'
import {
  clearNativeCaptures,
  PhotoReadError,
  preparePhoto,
  type PreparedPhoto,
} from '@/services/photos/preparePhoto'
import { formatDate, nowIso, toIso } from '@/services/time'
import { usePhotosStore } from '@/stores/photos'
import { useNotifyStore } from '@/stores/notify'
import { mdiCameraOutline, mdiCompare, mdiImageOutline, mdiViewGridOutline } from '@/plugins/icons'
import ListPager from '@/components/common/ListPager.vue'
import PhotoDialog from './PhotoDialog.vue'
import PhotoCompareDialog from './PhotoCompareDialog.vue'
import ShareCollageDialog from '@/components/share/ShareCollageDialog.vue'

/**
 * Progress photos on the Progress page: take or choose one, a grid of them newest first, and a
 * side-by-side comparison. Photos stay in this device's database like every other entry.
 */
const photosStore = usePhotosStore()
const notify = useNotifyStore()
const storage = useStoragePersistence()

const cameraInput = ref<HTMLInputElement | null>(null)
const libraryInput = ref<HTMLInputElement | null>(null)
const reading = ref(false)

const dialog = ref(false)
const viewing = ref<PhotoRow | null>(null)
const prepared = ref<PreparedPhoto | null>(null)
const takenAt = ref('')
const compareOpen = ref(false)
const collageOpen = ref(false)

const PAGE = 12
const pages = usePaging(() => photosStore.photos, PAGE)
const canCompare = computed(() => photosStore.photos.length >= 2)

async function onFile(event: Event, fromCamera: boolean) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  reading.value = true
  try {
    prepared.value = await preparePhoto(file)
    // A photo from the library keeps the time it was taken, when the file still carries it.
    takenAt.value = !fromCamera && file.lastModified ? toIso(file.lastModified) : nowIso()
    viewing.value = null
    dialog.value = true
  } catch (e) {
    notify.show(e instanceof PhotoReadError ? e.message : "Couldn't read that photo.", 'error')
  } finally {
    reading.value = false
    if (fromCamera) void clearNativeCaptures()
  }
}

function view(photo: PhotoRow) {
  prepared.value = null
  viewing.value = photo
  dialog.value = true
}

/** Photos raise the stakes of the browser clearing site data, so ask again to keep it. */
function onSaved() {
  prepared.value = null
  void storage.actions.refresh()
}
</script>

<template>
  <v-card>
    <v-card-item>
      <p class="pc-eyebrow">For your eyes only</p>
      <v-card-title>Progress photos</v-card-title>
    </v-card-item>
    <v-card-text class="pc-stack">
      <p v-if="!photosStore.photos.length">Take one every few weeks, in the same spot and pose.</p>
      <ul v-else class="grid" aria-label="Your progress photos, newest first">
        <li v-for="photo in pages.current.value.items" :key="photo.id">
          <button
            type="button"
            class="thumb"
            :aria-label="`${POSE_LABELS[photo.pose]} photo from ${formatDate(photo.takenAt)}`"
            @click="view(photo)"
          >
            <img
              v-if="photosStore.thumbUrls[photo.id]"
              :src="photosStore.thumbUrls[photo.id]"
              alt=""
              loading="lazy"
            />
            <span class="caption pc-num">{{ formatDate(photo.takenAt) }}</span>
          </button>
        </li>
      </ul>
      <ListPager v-model="pages.state.page" :current="pages.current.value" noun="photos" />
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          color="primary"
          variant="flat"
          :prepend-icon="mdiCameraOutline"
          :loading="reading"
          @click="cameraInput?.click()"
        >
          Take a photo
        </v-btn>
        <v-btn variant="outlined" :prepend-icon="mdiImageOutline" @click="libraryInput?.click()">
          Choose a photo
        </v-btn>
        <v-btn
          v-if="canCompare"
          variant="tonal"
          :prepend-icon="mdiCompare"
          @click="compareOpen = true"
        >
          Compare
        </v-btn>
        <v-btn
          v-if="canCompare"
          variant="tonal"
          :prepend-icon="mdiViewGridOutline"
          @click="collageOpen = true"
        >
          Share collage
        </v-btn>
      </div>
      <input
        ref="cameraInput"
        type="file"
        accept="image/*"
        capture="user"
        class="d-none"
        aria-label="Take a photo"
        @change="onFile($event, true)"
      />
      <input
        ref="libraryInput"
        type="file"
        accept="image/*"
        class="d-none"
        aria-label="Choose a photo"
        @change="onFile($event, false)"
      />
      <p v-if="photosStore.photos.length" class="text-body-small pc-muted">
        Photos are included when you save a backup in Settings.
      </p>
    </v-card-text>

    <PhotoDialog
      v-model="dialog"
      :photo="viewing"
      :prepared="prepared"
      :taken-at="takenAt"
      @saved="onSaved"
    />
    <PhotoCompareDialog v-model="compareOpen" />
    <ShareCollageDialog v-model="collageOpen" />
  </v-card>
</template>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: var(--pc-radius-sm);
  overflow: hidden;
  background: var(--pc-surface-sunk);
  cursor: pointer;
}

.thumb:focus-visible {
  outline: none;
  box-shadow: var(--pc-shadow-focus);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.caption {
  position: absolute;
  inset: auto 0 0;
  padding: 2px 6px;
  font-size: 0.6875rem;
  text-align: start;
  color: var(--pc-text-1);
  background: var(--pc-glass-strong);
}
</style>
