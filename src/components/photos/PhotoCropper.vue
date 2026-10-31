<script setup lang="ts">
import { computed, ref } from 'vue'
import { CROP_HANDLES, dragCrop, type CropHandle, type CropRect, type Size } from '@/domain/crop'

/**
 * A crop frame over a photo: drag inside it to move it, drag a corner to resize it. With focus,
 * the arrow keys move it and Shift with the arrow keys resizes it from the lower-right corner.
 * The frame (`v-model`) is in the image's own pixels, so it does not depend on the screen size.
 */
const props = defineProps<{
  src: string
  size: Size
  /** Width over height to hold the frame to, or null for any shape. */
  ratio: number | null
}>()
const rect = defineModel<CropRect>({ required: true })

const frame = ref<HTMLElement | null>(null)

/** The frame as percentages of the image, so it scales with the picture. */
const boxStyle = computed(() => {
  const { width, height } = props.size
  return {
    left: `${(rect.value.x / width) * 100}%`,
    top: `${(rect.value.y / height) * 100}%`,
    width: `${(rect.value.width / width) * 100}%`,
    height: `${(rect.value.height / height) * 100}%`,
  }
})

/** Fits the picture inside the dialog without stretching: full width, or capped by height. */
const frameStyle = computed(() => ({
  aspectRatio: `${props.size.width} / ${props.size.height}`,
  width: `min(100%, calc(60vh * ${props.size.width / props.size.height}))`,
}))

let drag: {
  handle: CropHandle
  x: number
  y: number
  start: CropRect
  scale: number
  id: number
} | null = null

function onPointerDown(event: PointerEvent, handle: CropHandle) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const el = frame.value
  if (!el) return
  event.preventDefault()
  // Screen pixels to image pixels: the picture is drawn at the frame's width.
  const scale = props.size.width / el.getBoundingClientRect().width
  drag = {
    handle,
    x: event.clientX,
    y: event.clientY,
    start: rect.value,
    scale,
    id: event.pointerId,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  rect.value = dragCrop(
    drag.start,
    drag.handle,
    (event.clientX - drag.x) * drag.scale,
    (event.clientY - drag.y) * drag.scale,
    props.size,
    props.ratio,
  )
}

function onPointerUp(event: PointerEvent) {
  if (drag && event.pointerId === drag.id) drag = null
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function onKeydown(event: KeyboardEvent) {
  const arrow = ARROWS[event.key]
  if (!arrow) return
  event.preventDefault()
  const step = Math.min(props.size.width, props.size.height) * 0.02
  rect.value = dragCrop(
    rect.value,
    event.shiftKey ? 'se' : 'move',
    arrow[0] * step,
    arrow[1] * step,
    props.size,
    props.ratio,
  )
}
</script>

<template>
  <div ref="frame" class="cropper" :style="frameStyle">
    <img :src="src" alt="The photo you are cropping" draggable="false" />
    <div
      class="cropper__box"
      :style="boxStyle"
      role="group"
      tabindex="0"
      aria-label="Crop frame. Arrow keys move it; Shift and the arrow keys resize it."
      @pointerdown="onPointerDown($event, 'move')"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <span
        v-for="h in CROP_HANDLES"
        :key="h"
        :class="['cropper__handle', `cropper__handle--${h}`]"
        aria-hidden="true"
        @pointerdown.stop="onPointerDown($event, h)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
  </div>
</template>

<style scoped>
.cropper {
  position: relative;
  margin-inline: auto;
  border-radius: var(--pc-radius-md);
  overflow: hidden;
  background: var(--pc-surface-sunk);
  /* The finger drives the frame here, never the page scroll or a pinch zoom. */
  touch-action: none;
  user-select: none;
}

.cropper img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* A veil over everything outside the frame, drawn as the frame's own spread shadow. */
.cropper__box {
  position: absolute;
  cursor: move;
  outline: 2px solid var(--pc-surface);
  box-shadow:
    0 0 0 1px var(--pc-brand),
    0 0 0 100vmax color-mix(in srgb, var(--pc-bg) 62%, transparent);
}

.cropper__box:focus-visible {
  outline-color: var(--pc-brand);
  outline-width: 3px;
}

.cropper__handle {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-brand);
  border: 2px solid var(--pc-surface);
  box-shadow: var(--pc-shadow-sm);
}

/*
 * The dots sit just inside the corners, so they stay whole when the frame fills the photo.
 * Each is small, but answers a full touch target around it.
 */
.cropper__handle::before {
  content: '';
  position: absolute;
  inset: calc((var(--pc-touch) - 18px) / -2);
}

.cropper__handle--nw {
  top: 4px;
  left: 4px;
  cursor: nwse-resize;
}
.cropper__handle--ne {
  top: 4px;
  right: 4px;
  cursor: nesw-resize;
}
.cropper__handle--sw {
  bottom: 4px;
  left: 4px;
  cursor: nesw-resize;
}
.cropper__handle--se {
  bottom: 4px;
  right: 4px;
  cursor: nwse-resize;
}
</style>
