<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, useId, watch } from 'vue'
import type { PhotoRow } from '@/db/database'
import { initialCrop, isFullFrame, type CropRect } from '@/domain/crop'
import { nearestWeight, PHOTO_POSES, POSE_LABELS, type PhotoPose } from '@/domain/photos'
import { formatWeight } from '@/domain/bodyUnits'
import { cropPhoto, type PreparedPhoto } from '@/services/photos/preparePhoto'
import { mdiCrop } from '@/plugins/icons'
import PhotoCropper from './PhotoCropper.vue'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useSettingsStore } from '@/stores/settings'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { formatDate, fromLocalInputValue, toEpochMs, toLocalInputValue } from '@/services/time'

/**
 * Save a new progress photo (`prepared`, taken or chosen a moment ago), or view, edit and
 * delete a saved one (`photo`). A new photo can be cropped before it is saved; the crop is
 * applied to a working copy, so Undo crop returns to the photo as it was taken.
 */
const props = defineProps<{
  photo: PhotoRow | null
  prepared: PreparedPhoto | null
  /** When a new photo was taken, as UTC ISO. */
  takenAt: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const journal = useJournalStore()
const photosStore = usePhotosStore()
const settings = useSettingsStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const titleId = useId()
const poseLabelId = useId()
const shapeLabelId = useId()
const saving = ref(false)
const imageUrl = ref<string | null>(null)

/** The new photo as it will be saved: `prepared`, or a crop of it. */
const working = shallowRef<PreparedPhoto | null>(null)
const cropped = computed(() => working.value !== null && working.value !== props.prepared)

const form = reactive({ takenAt: '', pose: 'front' as PhotoPose, notes: '' })

function releaseImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = null
}

function showWorking() {
  releaseImage()
  if (working.value) {
    imageUrl.value = URL.createObjectURL(new Blob([working.value.image], { type: 'image/jpeg' }))
  }
}

// Reset from props each time the dialog opens, so an abandoned edit never leaks into the next.
watch(open, async (isOpen) => {
  releaseImage()
  cropping.value = false
  working.value = null
  if (!isOpen) return
  const p = props.photo
  form.takenAt = toLocalInputValue(p?.takenAt ?? props.takenAt)
  form.pose = p?.pose ?? photosStore.photos[0]?.pose ?? 'front'
  form.notes = p?.notes ?? ''
  if (props.prepared) {
    working.value = props.prepared
    showWorking()
  } else if (p) {
    const url = await photosStore.imageUrl(p.id)
    // The dialog may have closed, or moved to another photo, while the image was read.
    if (open.value && props.photo?.id === p.id) imageUrl.value = url
    else if (url) URL.revokeObjectURL(url)
  }
})

onBeforeUnmount(releaseImage)

const aspect = computed(() => {
  const size = working.value ?? props.photo
  return size ? size.width / size.height : 3 / 4
})

/*
 * The preview box takes the photo's own shape, sized like the cropper, so the Crop button over
 * its corner sits on the picture rather than on letterboxing.
 */
const frameStyle = computed(() => ({
  aspectRatio: aspect.value,
  width: `min(100%, calc(60vh * ${aspect.value}))`,
}))

/*
 * Cropping: the frame is held in the working image's pixels. Portrait matches the 3:4 tiles of
 * a shared collage, so a photo cropped that way is shown whole there.
 */
const CROP_SHAPES = { free: null, portrait: 3 / 4, square: 1 } as const
type CropShape = keyof typeof CROP_SHAPES
const cropping = ref(false)
const cropShape = ref<CropShape>('free')
const cropRect = ref<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
const applyingCrop = ref(false)

const workingSize = computed(() =>
  working.value ? { width: working.value.width, height: working.value.height } : null,
)

function startCrop() {
  if (!workingSize.value) return
  cropShape.value = 'free'
  cropRect.value = initialCrop(workingSize.value, null)
  cropping.value = true
}

watch(cropShape, (shape) => {
  if (workingSize.value) cropRect.value = initialCrop(workingSize.value, CROP_SHAPES[shape])
})

async function applyCrop() {
  const photo = working.value
  const size = workingSize.value
  if (!photo || !size) return
  if (isFullFrame(cropRect.value, size)) {
    cropping.value = false
    return
  }
  applyingCrop.value = true
  try {
    working.value = await cropPhoto(photo, cropRect.value)
    showWorking()
    cropping.value = false
  } catch {
    notify.show("Couldn't crop that photo.", 'error')
  } finally {
    applyingCrop.value = false
  }
}

function undoCrop() {
  working.value = props.prepared
  showWorking()
}

/** The weigh-in logged nearest the photo, shown so the photo reads with its number. */
const nearby = computed(() => {
  if (!form.takenAt) return null
  const at = toEpochMs(fromLocalInputValue(form.takenAt))
  const w = nearestWeight(
    journal.weights.map((row) => ({ at: toEpochMs(row.measuredAt), kg: row.kg })),
    at,
  )
  return w
    ? `Your weigh-in on ${formatDate(w.at)}: ${formatWeight(w.kg, settings.weightUnit)}`
    : null
})

async function save() {
  if (!form.takenAt) return
  saving.value = true
  const details = {
    takenAt: fromLocalInputValue(form.takenAt),
    pose: form.pose,
    notes: form.notes.trim(),
  }
  try {
    if (props.photo) await photosStore.updatePhoto(props.photo.id, details)
    else if (working.value) await photosStore.addPhoto(details, working.value)
    notify.show(props.photo ? 'Photo updated' : 'Photo saved', 'success')
    emit('saved')
    open.value = false
  } catch {
    notify.show("Couldn't save. Your device may be out of space.", 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const p = props.photo
  if (!p) return
  const ok = await confirm.ask({
    title: 'Delete this photo?',
    text: `${POSE_LABELS[p.pose]} photo from ${formatDate(p.takenAt)}. This can't be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await photosStore.deletePhoto(p.id)
  notify.show('Photo deleted', 'success')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <p class="pc-eyebrow">{{ photo ? formatDate(photo.takenAt) : 'New' }}</p>
        <v-card-title :id="titleId">Progress photo</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <template v-if="cropping && imageUrl && workingSize">
          <PhotoCropper
            v-model="cropRect"
            :src="imageUrl"
            :size="workingSize"
            :ratio="CROP_SHAPES[cropShape]"
          />
          <p class="text-body-small pc-muted">
            Drag the frame to move it, or a corner to resize it.
          </p>
          <div>
            <p :id="shapeLabelId" class="pc-label">Shape</p>
            <v-btn-toggle
              v-model="cropShape"
              role="group"
              mandatory
              density="comfortable"
              :aria-labelledby="shapeLabelId"
            >
              <v-btn value="free">Free</v-btn>
              <v-btn value="portrait">3:4</v-btn>
              <v-btn value="square">Square</v-btn>
            </v-btn-toggle>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn variant="text" :disabled="applyingCrop" @click="cropping = false">
              Cancel crop
            </v-btn>
            <v-btn variant="tonal" :loading="applyingCrop" @click="applyCrop">Apply crop</v-btn>
          </div>
        </template>
        <template v-else>
          <div class="frame" :style="frameStyle">
            <img v-if="imageUrl" :src="imageUrl" alt="Your progress photo" />
            <div v-if="working" class="frame__actions">
              <v-btn v-if="cropped" variant="flat" color="surface" size="small" @click="undoCrop">
                Undo crop
              </v-btn>
              <v-btn
                variant="flat"
                color="surface"
                size="small"
                :prepend-icon="mdiCrop"
                @click="startCrop"
              >
                Crop
              </v-btn>
            </div>
          </div>
        </template>
        <p v-if="nearby" class="text-body-small pc-muted">{{ nearby }}</p>
        <div>
          <p :id="poseLabelId" class="pc-label">Pose</p>
          <v-btn-toggle
            v-model="form.pose"
            role="group"
            mandatory
            density="comfortable"
            :aria-labelledby="poseLabelId"
          >
            <v-btn v-for="pose in PHOTO_POSES" :key="pose" :value="pose">
              {{ POSE_LABELS[pose] }}
            </v-btn>
          </v-btn-toggle>
        </div>
        <v-text-field v-model="form.takenAt" label="When" type="datetime-local" />
        <v-textarea v-model="form.notes" label="Notes (optional)" rows="2" auto-grow />
        <template v-if="photo">
          <v-divider />
          <div>
            <v-btn variant="text" color="error" @click="remove">Delete photo</v-btn>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ photo ? 'Close' : 'Cancel' }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!form.takenAt || cropping"
          :loading="saving"
          @click="save"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.frame {
  position: relative;
  margin-inline: auto;
  flex-shrink: 0;
  border-radius: var(--pc-radius-md);
  overflow: hidden;
  background: var(--pc-surface-sunk);
}

.frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.frame__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
}
</style>
