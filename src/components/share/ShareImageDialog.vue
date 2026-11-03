<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import { useChartColors } from '@/composables/useChartColors'
import { useNotifyStore } from '@/stores/notify'
import { saveFile } from '@/services/fileTransfer'
import { fileDate, systemClock } from '@/services/time'
import { mdiShareVariantOutline } from '@/plugins/icons'
import { renderShareCard, type ShareCardContent } from './shareCard'

/**
 * Preview an image card and share it: the share sheet on phones (Messages, WhatsApp, Photos),
 * a download elsewhere. The image is drawn on the device and leaves only when the user shares
 * it. Privacy choices go in the default slot. A chart card passes `content`; any other image
 * passes `render` with a `renderKey` that changes with its options. The preview redraws
 * whenever either changes.
 */
const props = withDefaults(
  defineProps<{
    title: string
    /** File name without the date or extension: "pepcalc-weight". */
    fileStem: string
    content?: ShareCardContent | null
    render?: (() => Promise<Blob>) | null
    renderKey?: string
    /** The image's shape, as CSS aspect-ratio. */
    aspect?: string
  }>(),
  { content: null, render: null, renderKey: '', aspect: '4 / 5' },
)

const open = defineModel<boolean>({ required: true })

/** A plain switch on a 48px row: the preview is the focus, and the row keeps a touch target. */
const OPTION_DEFAULTS = { VSwitch: { inset: false, density: 'comfortable' } }
const notify = useNotifyStore()
const { colors } = useChartColors()
const titleId = useId()

const image = ref<Blob | null>(null)
const previewUrl = ref<string | null>(null)
const busy = ref(false)

function setPreview(blob: Blob | null) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  image.value = blob
  previewUrl.value = blob ? URL.createObjectURL(blob) : null
}

/** Only the latest render wins, so quick toggling never shows a stale preview. */
let generation = 0
async function redraw() {
  const content = props.content
  const draw = props.render ?? (content ? () => renderShareCard(content, colors.value) : null)
  const mine = ++generation
  // Nothing to draw any more: drop the old preview so it cannot be shared by mistake.
  if (!draw) {
    setPreview(null)
    busy.value = false
    return
  }
  busy.value = true
  try {
    const blob = await draw()
    if (mine === generation) setPreview(blob)
  } catch {
    notify.show("Couldn't create the image.", 'error')
    open.value = false
  } finally {
    if (mine === generation) busy.value = false
  }
}

watch(
  [open, () => props.content, () => props.renderKey],
  () => {
    if (open.value) void redraw()
    else setPreview(null)
  },
  { deep: true },
)
onBeforeUnmount(() => setPreview(null))

async function share() {
  if (!image.value) return
  const result = await saveFile(
    `${props.fileStem}-${fileDate(systemClock().getTime())}.png`,
    image.value,
  )
  if (result === 'downloaded') notify.show('Image saved', 'success')
  if (result !== 'cancelled') open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <v-card-title :id="titleId">{{ title }}</v-card-title>
      </v-card-item>
      <v-card-text class="pc-stack">
        <div class="share-preview" :style="{ '--share-aspect': aspect }">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Preview of the image to share"
            class="share-preview__img"
          />
          <v-progress-circular v-else-if="busy" indeterminate color="primary" />
        </div>
        <!-- Privacy options sit under the preview as a short list, sized like the buttons. -->
        <v-defaults-provider :defaults="OPTION_DEFAULTS">
          <div class="pc-stack pc-stack--tight pc-options">
            <slot />
          </div>
        </v-defaults-provider>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          variant="flat"
          color="primary"
          :prepend-icon="mdiShareVariantOutline"
          :disabled="!image"
          :loading="busy"
          @click="share"
        >
          Share
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/*
 * A definite width, never shrink-to-fit: the auto margins centre it in the column, which turns
 * off stretching, and a fit-content box around a percentage-sized image can lay out at zero
 * width if the image decodes late (WebKit). The cap keeps the height within 52vh.
 */
.share-preview {
  --share-aspect: 4 / 5;
  display: grid;
  place-items: center;
  width: 100%;
  max-width: calc(52vh * (var(--share-aspect)));
  aspect-ratio: var(--share-aspect);
  margin-inline: auto;
}

.share-preview__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--pc-radius-md);
  box-shadow: var(--pc-glass-shadow);
}
</style>
