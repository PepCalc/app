<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { SolutionColor } from '@/domain/catalog'
import { readSyringe, syringeTicks, toScale, type SyringeSpec } from '@/domain/syringe'
import { roundTo } from '@/domain/units'

const props = withDefaults(
  defineProps<{
    syringe: SyringeSpec
    volumeMl: number
    solutionColor?: SolutionColor
    /**
     * Draw the needle and plunger. Off draws only the graduated barrel and its liquid, which
     * store policies on medical syringe imagery allow (see `realisticSyringe` in settings).
     */
    realistic?: boolean
  }>(),
  {
    solutionColor: 'clear',
    realistic: false,
  },
)

// Drawing geometry in viewBox units; the SVG scales to its container width.
const VIEW_W = 640
const VIEW_H = 148
const BARREL_X = 88
const BARREL_W = 452
const BARREL_Y = 44
const BARREL_H = 52
const MID_Y = BARREL_Y + BARREL_H / 2
const STOPPER_W = 16
const HANDLE_X = BARREL_X + BARREL_W + 44

const MOUNT_MS = 720
const UPDATE_MS = 500

const reading = computed(() => readSyringe(props.volumeMl, props.syringe))
const fillFraction = computed(() => Math.min(1, props.volumeMl / props.syringe.capacityMl))

// The plunger glides to each new reading so a change in the draw is visible, not just a jump.
// The text reading is never tweened: only the drawing moves.
const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const shownFraction = ref(fillFraction.value)
let frame = 0

function glideTo(target: number, durationMs = UPDATE_MS) {
  cancelAnimationFrame(frame)
  if (reduceMotion || typeof requestAnimationFrame !== 'function') {
    shownFraction.value = target
    return
  }
  const from = shownFraction.value
  if (Math.abs(target - from) < 1e-4) {
    shownFraction.value = target
    return
  }
  let start: number | undefined
  const step = (t: number) => {
    start ??= t
    const p = Math.min(1, (t - start) / durationMs)
    // Quartic ease-out: quick initial draw, gentle settle onto the mark.
    shownFraction.value = from + (target - from) * (1 - (1 - p) ** 4)
    if (p < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

onMounted(() => {
  // First appearance draws up from empty, like filling a real syringe.
  shownFraction.value = 0
  glideTo(fillFraction.value, MOUNT_MS)
})
watch(fillFraction, (target) => glideTo(target, UPDATE_MS))
onBeforeUnmount(() => cancelAnimationFrame(frame))

const fillX = computed(() => BARREL_X + BARREL_W * shownFraction.value)
const liquidW = computed(() => Math.max(0, fillX.value - BARREL_X - 1))
const rodX = computed(() => fillX.value + STOPPER_W - 1)
const rodW = computed(() => Math.max(0, HANDLE_X - rodX.value + 2))

/** Concave meniscus arc where the liquid meets the rubber stopper's front sealing edge. */
const meniscusPath = computed(() => {
  const x = fillX.value - 0.5
  const top = BARREL_Y + 2
  const bot = BARREL_Y + BARREL_H - 2
  const curve = Math.min(5, liquidW.value * 0.35)
  return `M ${x} ${top} Q ${x - curve} ${MID_Y} ${x} ${bot}`
})

// Gradient and clip ids must be unique when several syringes render on one page.
const uid = useId()
const barrelId = `${uid}-barrel`
const fluidId = `${uid}-fluid`
const steelId = `${uid}-steel`
const hubId = `${uid}-hub`
const stopperId = `${uid}-stopper`
const rodId = `${uid}-rod`
const clipId = `${uid}-barrel-clip`

const TICK_LENGTH = { major: 21, half: 14, minor: 8 } as const
const ticks = computed(() =>
  syringeTicks(props.syringe).map((t) => ({
    x: BARREL_X + BARREL_W * t.at,
    length: TICK_LENGTH[t.kind],
    kind: t.kind,
    label: t.label,
  })),
)

const scaleName = computed(() => (props.syringe.unitsPerMl === null ? 'mL' : 'units'))

const readingText = computed(() => {
  const r = reading.value
  return `${roundTo(r.scaleValue, 2)} ${scaleName.value}`
})

const flagLabel = computed(() =>
  reading.value.fits
    ? readingText.value
    : `exceeds ${roundTo(toScale(props.syringe.capacityMl, props.syringe), 3)} ${scaleName.value}`,
)

const flagPillW = computed(() => Math.max(88, flagLabel.value.length * 10 + 24))

/** Keep the reading pill inside the drawing when the fill is near either end. */
const flagX = computed(() => {
  const half = flagPillW.value / 2
  return Math.min(Math.max(fillX.value, BARREL_X + half - 12), BARREL_X + BARREL_W - half + 12)
})

const ariaLabel = computed(() => {
  const r = reading.value
  const capacity = roundTo(toScale(props.syringe.capacityMl, props.syringe), 3)
  const base = `${props.syringe.label}, filled to ${readingText.value} of ${capacity} ${scaleName.value}`
  return r.fits ? base : `${base}. The draw exceeds this syringe's capacity.`
})
</script>

<template>
  <figure
    class="syringe"
    :class="[
      `syringe--${solutionColor}`,
      {
        'syringe--over': !reading.fits,
        'syringe--reduced': reduceMotion,
        'syringe--simple': !realistic,
      },
    ]"
    :data-solution="solutionColor"
  >
    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      role="img"
      :aria-label="ariaLabel"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient :id="barrelId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__barrel-stop--edge" />
          <stop offset="0.16" class="syringe__barrel-stop--core" />
          <stop offset="0.82" class="syringe__barrel-stop--core" />
          <stop offset="1" class="syringe__barrel-stop--edge" />
        </linearGradient>

        <linearGradient :id="fluidId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__stop--deep" />
          <stop offset="0.24" class="syringe__stop--light" />
          <stop offset="0.58" class="syringe__stop--mid" />
          <stop offset="1" class="syringe__stop--deep" />
        </linearGradient>

        <linearGradient :id="steelId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__steel-stop--dark" />
          <stop offset="0.38" class="syringe__steel-stop--light" />
          <stop offset="1" class="syringe__steel-stop--dark" />
        </linearGradient>

        <linearGradient :id="hubId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__hub-stop--deep" />
          <stop offset="0.32" class="syringe__hub-stop--main" />
          <stop offset="0.72" class="syringe__hub-stop--main" />
          <stop offset="1" class="syringe__hub-stop--deep" />
        </linearGradient>

        <linearGradient :id="stopperId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__stopper-stop--dark" />
          <stop offset="0.28" class="syringe__stopper-stop--hi" />
          <stop offset="0.62" class="syringe__stopper-stop--dark" />
          <stop offset="1" class="syringe__stopper-stop--dark" />
        </linearGradient>

        <linearGradient :id="rodId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="syringe__rod-stop--shade" />
          <stop offset="0.3" class="syringe__rod-stop--hi" />
          <stop offset="0.65" class="syringe__rod-stop--mid" />
          <stop offset="1" class="syringe__rod-stop--shade" />
        </linearGradient>

        <clipPath :id="clipId">
          <rect
            :x="BARREL_X + 1"
            :y="BARREL_Y + 1"
            :width="BARREL_W - 2"
            :height="BARREL_H - 2"
            rx="5"
          />
        </clipPath>
      </defs>

      <!-- Beveled stainless-steel needle -->
      <g v-if="realistic" class="syringe__needle-group">
        <path
          :d="`M 6 ${MID_Y} L 16 ${MID_Y - 1.8} L 62 ${MID_Y - 1.8} L 62 ${MID_Y + 1.8} L 12 ${MID_Y + 1.8} Z`"
          :fill="`url(#${steelId})`"
        />
        <line class="syringe__needle-glint" x1="15" :y1="MID_Y - 0.8" x2="61" :y2="MID_Y - 0.8" />
      </g>

      <!-- Contoured needle hub and barrel shoulder -->
      <g class="syringe__hub-group">
        <template v-if="realistic">
          <rect :x="60" :y="MID_Y - 6.5" width="11" height="13" rx="2" :fill="`url(#${hubId})`" />
          <rect :x="69" :y="MID_Y - 10" width="14" height="20" rx="2.5" :fill="`url(#${hubId})`" />
          <line class="syringe__hub-rib" x1="73" :y1="MID_Y - 9" x2="73" :y2="MID_Y + 9" />
          <line class="syringe__hub-rib" x1="78" :y1="MID_Y - 9" x2="78" :y2="MID_Y + 9" />
        </template>
        <path
          class="syringe__shoulder"
          :d="`M 82 ${MID_Y - 12} L ${BARREL_X + 2} ${BARREL_Y + 6} L ${BARREL_X + 2} ${BARREL_Y + BARREL_H - 6} L 82 ${MID_Y + 12} Z`"
          :fill="`url(#${barrelId})`"
        />
      </g>

      <!-- Cruciform plunger rod extending to the fixed thumb handle -->
      <g v-if="realistic" class="syringe__rod-group">
        <rect :x="rodX" :y="MID_Y - 7.5" :width="rodW" height="15" :fill="`url(#${rodId})`" />
        <line class="syringe__rod-rib" :x1="rodX" :y1="MID_Y - 7" :x2="HANDLE_X" :y2="MID_Y - 7" />
        <line class="syringe__rod-rib" :x1="rodX" :y1="MID_Y + 7" :x2="HANDLE_X" :y2="MID_Y + 7" />
        <line class="syringe__rod-spine" :x1="rodX" :y1="MID_Y" :x2="HANDLE_X" :y2="MID_Y" />
      </g>

      <!-- Barrel body -->
      <rect
        class="syringe__barrel"
        :x="BARREL_X"
        :y="BARREL_Y"
        :width="BARREL_W"
        :height="BARREL_H"
        rx="6"
        :fill="`url(#${barrelId})`"
      />

      <!-- Interior clipped to the barrel cylinder -->
      <g :clip-path="`url(#${clipId})`">
        <!-- Internal section of the plunger rod visible through empty barrel -->
        <template v-if="realistic">
          <rect :x="rodX" :y="MID_Y - 7" :width="rodW" height="14" :fill="`url(#${rodId})`" />
          <line
            class="syringe__rod-spine"
            :x1="rodX"
            :y1="MID_Y"
            :x2="BARREL_X + BARREL_W"
            :y2="MID_Y"
          />
        </template>

        <!-- Drawn liquid column -->
        <g v-if="liquidW > 0.5" class="syringe__liquid-group">
          <rect
            class="syringe__fill"
            :x="BARREL_X + 1"
            :y="BARREL_Y + 1"
            :width="liquidW"
            :height="BARREL_H - 2"
            :fill="`url(#${fluidId})`"
          />
          <!-- Refractive wall edge accent so clear liquids remain unmistakable -->
          <rect
            class="syringe__fill-rail"
            :x="BARREL_X + 1"
            :y="BARREL_Y + BARREL_H - 5"
            :width="liquidW"
            height="3.5"
          />
          <rect
            class="syringe__fill-rail syringe__fill-rail--top"
            :x="BARREL_X + 1"
            :y="BARREL_Y + 1.5"
            :width="liquidW"
            height="2.5"
          />
          <!-- Curved meniscus where fluid meets the rubber piston -->
          <path class="syringe__meniscus" :d="meniscusPath" />
          <!-- Delicate refraction highlight near the stopper edge -->
          <circle
            v-if="liquidW > 20"
            class="syringe__bubble"
            :cx="fillX - 7"
            :cy="BARREL_Y + 15"
            r="2.2"
          />
        </g>

        <!-- Dual-ribbed elastomeric rubber stopper; leading edge sits exactly on fillX -->
        <g v-if="realistic" class="syringe__stopper">
          <rect
            :x="fillX"
            :y="BARREL_Y + 2"
            width="6"
            :height="BARREL_H - 4"
            rx="1.5"
            :fill="`url(#${stopperId})`"
          />
          <rect
            class="syringe__stopper-waist"
            :x="fillX + 5.5"
            :y="BARREL_Y + 5"
            width="5"
            :height="BARREL_H - 10"
            :fill="`url(#${stopperId})`"
          />
          <rect
            :x="fillX + 10"
            :y="BARREL_Y + 2"
            width="6"
            :height="BARREL_H - 4"
            rx="1.5"
            :fill="`url(#${stopperId})`"
          />
          <!-- Leading sealing-edge hairline -->
          <line
            class="syringe__stopper-edge"
            :x1="fillX + 0.6"
            :y1="BARREL_Y + 3"
            :x2="fillX + 0.6"
            :y2="BARREL_Y + BARREL_H - 3"
          />
        </g>

        <!-- Cylindrical glass specular reflections above liquid and stopper -->
        <rect
          class="syringe__glint"
          :x="BARREL_X + 6"
          :y="BARREL_Y + 6"
          :width="BARREL_W - 12"
          height="6"
          rx="3"
        />
        <rect
          class="syringe__glint syringe__glint--fine"
          :x="BARREL_X + 10"
          :y="BARREL_Y + 14"
          :width="BARREL_W - 20"
          height="2"
          rx="1"
        />
        <rect
          class="syringe__glint syringe__glint--bounce"
          :x="BARREL_X + 12"
          :y="BARREL_Y + BARREL_H - 9"
          :width="BARREL_W - 24"
          height="2.5"
          rx="1.25"
        />
      </g>

      <!-- Barrel outline crisp over interior clipping -->
      <rect
        class="syringe__barrel-rim"
        :x="BARREL_X"
        :y="BARREL_Y"
        :width="BARREL_W"
        :height="BARREL_H"
        rx="6"
      />

      <!-- Flared finger flange at the barrel mouth -->
      <g class="syringe__flange-group">
        <rect
          :x="BARREL_X + BARREL_W + 1"
          :y="BARREL_Y - 11"
          width="10"
          :height="BARREL_H + 22"
          rx="4.5"
          :fill="`url(#${rodId})`"
          class="syringe__flange"
        />
        <line
          class="syringe__flange-glint"
          :x1="BARREL_X + BARREL_W + 4"
          :y1="BARREL_Y - 8"
          :x2="BARREL_X + BARREL_W + 4"
          :y2="BARREL_Y + BARREL_H + 8"
        />
      </g>

      <!-- Fixed thumb rest (plunger handle stays inside the panel bounds) -->
      <g v-if="realistic" class="syringe__thumb-group">
        <rect
          :x="HANDLE_X"
          :y="BARREL_Y - 9"
          width="14"
          :height="BARREL_H + 18"
          rx="5"
          :fill="`url(#${rodId})`"
          class="syringe__thumb"
        />
        <line
          class="syringe__thumb-glint"
          :x1="HANDLE_X + 3.5"
          :y1="BARREL_Y - 5"
          :x2="HANDLE_X + 3.5"
          :y2="BARREL_Y + BARREL_H + 5"
        />
      </g>

      <!-- Graduations along the top edge of the barrel, numbers below -->
      <g class="syringe__ticks">
        <line
          v-for="(t, i) in ticks"
          :key="i"
          :class="`syringe__tick--${t.kind}`"
          :x1="t.x"
          :y1="BARREL_Y"
          :x2="t.x"
          :y2="BARREL_Y + t.length"
        />
      </g>
      <g class="syringe__labels">
        <template v-for="(t, i) in ticks" :key="`l${i}`">
          <text v-if="t.label !== null" :x="t.x" :y="BARREL_Y + BARREL_H + 22" text-anchor="middle">
            {{ t.label }}
          </text>
        </template>
      </g>

      <!-- Draw alignment line and floating reading pill -->
      <line
        class="syringe__target"
        :x1="fillX"
        :y1="BARREL_Y - 8"
        :x2="fillX"
        :y2="BARREL_Y + BARREL_H + 5"
      />
      <polygon
        class="syringe__pointer"
        :points="`${fillX - 5},${BARREL_Y - 12} ${fillX + 5},${BARREL_Y - 12} ${fillX},${BARREL_Y - 5}`"
      />
      <rect
        class="syringe__pill"
        :x="flagX - flagPillW / 2"
        y="4"
        :width="flagPillW"
        height="27"
        rx="13.5"
      />
      <text class="syringe__reading" :x="flagX" y="22.5" text-anchor="middle">
        {{ flagLabel }}
      </text>
    </svg>
    <figcaption class="pc-faint">{{ syringe.label }}</figcaption>
  </figure>
</template>

<style scoped>
.syringe {
  margin: 0;
  --_fluid-light: var(--pc-syringe-clear-light);
  --_fluid-mid: var(--pc-syringe-clear-mid);
  --_fluid-deep: var(--pc-syringe-clear-deep);
  --_fluid-meniscus: var(--pc-syringe-clear-meniscus);
}

.syringe--blue {
  --_fluid-light: var(--pc-syringe-blue-light);
  --_fluid-mid: var(--pc-syringe-blue-mid);
  --_fluid-deep: var(--pc-syringe-blue-deep);
  --_fluid-meniscus: var(--pc-syringe-blue-meniscus);
}

.syringe svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 180px;
}

.syringe figcaption {
  font-size: 0.8125rem;
  text-align: center;
  margin-top: 2px;
}

/* Barrel gradients */
.syringe__barrel-stop--core {
  stop-color: var(--pc-syringe-barrel);
}

.syringe__barrel-stop--edge {
  stop-color: var(--pc-syringe-barrel-shade);
}

.syringe__barrel {
  stroke: none;
}

.syringe__barrel-rim {
  fill: none;
  stroke: var(--pc-syringe-ink);
  stroke-width: 1.75;
}

.syringe__shoulder {
  stroke: var(--pc-syringe-ink);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

/* Steel needle */
.syringe__steel-stop--light {
  stop-color: var(--pc-syringe-steel-light);
}

.syringe__steel-stop--dark {
  stop-color: var(--pc-syringe-steel-dark);
}

.syringe__needle-glint {
  stroke: var(--pc-syringe-glint);
  stroke-width: 0.9;
  stroke-linecap: round;
}

/* Needle hub */
.syringe__hub-stop--main {
  stop-color: var(--pc-syringe-hub);
}

.syringe__hub-stop--deep {
  stop-color: var(--pc-syringe-hub-deep);
}

.syringe__hub-rib {
  stroke: var(--pc-syringe-hub-deep);
  stroke-width: 1.2;
  opacity: 0.55;
}

/* Liquid fill & meniscus: transitions smoothly when switching between clear and blue peptides */
.syringe__fill {
  opacity: 0.94;
}

.syringe__stop--light {
  stop-color: var(--_fluid-light);
  transition: stop-color 320ms var(--pc-ease-standard);
}

.syringe__stop--mid {
  stop-color: var(--_fluid-mid);
  transition: stop-color 320ms var(--pc-ease-standard);
}

.syringe__stop--deep {
  stop-color: var(--_fluid-deep);
  transition: stop-color 320ms var(--pc-ease-standard);
}

.syringe__fill-rail {
  fill: var(--_fluid-meniscus);
  opacity: 0.32;
  transition: fill 320ms var(--pc-ease-standard);
}

.syringe__fill-rail--top {
  opacity: 0.2;
}

.syringe__meniscus {
  fill: none;
  stroke: var(--_fluid-meniscus);
  stroke-width: 2.2;
  stroke-linecap: round;
  transition: stroke 320ms var(--pc-ease-standard);
}

.syringe__bubble {
  fill: var(--pc-syringe-glint);
  stroke: var(--_fluid-meniscus);
  stroke-width: 0.7;
  opacity: 0.75;
}

.syringe--reduced .syringe__stop--light,
.syringe--reduced .syringe__stop--mid,
.syringe--reduced .syringe__stop--deep,
.syringe--reduced .syringe__fill-rail,
.syringe--reduced .syringe__meniscus {
  transition: none;
}

/* Rubber stopper */
.syringe__stopper-stop--dark {
  stop-color: var(--pc-syringe-stopper);
}

.syringe__stopper-stop--hi {
  stop-color: var(--pc-syringe-stopper-hi);
}

.syringe__stopper-edge {
  stroke: var(--pc-syringe-stopper-hi);
  stroke-width: 1;
  opacity: 0.75;
}

/* Cruciform plunger rod, flange, and fixed handle */
.syringe__rod-stop--hi {
  stop-color: var(--pc-syringe-rod-hi);
}

.syringe__rod-stop--mid {
  stop-color: var(--pc-syringe-plunger);
}

.syringe__rod-stop--shade {
  stop-color: var(--pc-syringe-rod-shade);
}

.syringe__rod-rib {
  stroke: var(--pc-syringe-rod-shade);
  stroke-width: 1;
  opacity: 0.55;
}

.syringe__rod-spine {
  stroke: var(--pc-syringe-rod-hi);
  stroke-width: 1.5;
  opacity: 0.7;
}

.syringe__flange,
.syringe__thumb {
  stroke: var(--pc-syringe-rod-shade);
  stroke-width: 1.25;
}

.syringe__flange-glint,
.syringe__thumb-glint {
  stroke: var(--pc-syringe-glint);
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.65;
}

/* Cylindrical glass highlights */
.syringe__glint {
  fill: var(--pc-syringe-glint);
  pointer-events: none;
}

.syringe__glint--fine {
  opacity: 0.45;
}

.syringe__glint--bounce {
  opacity: 0.3;
}

/* Graduations and labels */
.syringe__ticks line {
  stroke: var(--pc-syringe-ink);
  stroke-width: 1.25;
}

.syringe__ticks .syringe__tick--major {
  stroke-width: 1.8;
}

.syringe__ticks .syringe__tick--half {
  stroke-width: 1.45;
}

.syringe__labels text {
  fill: var(--pc-text-2);
  font-family: var(--pc-font-mono);
  font-size: 14.5px;
}

/* Draw target line and floating reading pill */
.syringe__target {
  stroke: var(--_fluid-meniscus);
  stroke-width: 2;
  stroke-dasharray: 4 3;
  transition: stroke 320ms var(--pc-ease-standard);
}

.syringe__pointer {
  fill: var(--pc-text-1);
}

.syringe__pill {
  fill: var(--pc-surface-2);
  stroke: var(--pc-divider-strong);
  stroke-width: 1.25;
}

.syringe__reading {
  fill: var(--pc-text-1);
  font-family: var(--pc-font);
  font-weight: 700;
  font-size: 15.5px;
}

.syringe--over .syringe__target {
  stroke: var(--pc-alert-fg);
}

.syringe--over .syringe__pointer {
  fill: var(--pc-alert-fg);
}

.syringe--over .syringe__pill {
  fill: var(--pc-alert-bg);
  stroke: var(--pc-alert-fg);
}

.syringe--over .syringe__reading {
  fill: var(--pc-alert-fg);
}
</style>
