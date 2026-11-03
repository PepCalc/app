<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ComponentDose } from '@/domain/blend'
import { formatConcentration, type DrawPlan } from '@/domain/reconstitution'
import { scaleParts, type SyringeReading } from '@/domain/syringe'
import { AMOUNT_DECIMALS, formatQuantity, roundTo, type Quantity } from '@/domain/units'
import { formatDateTime, nowIso } from '@/services/time'
import ShareImageDialog from './ShareImageDialog.vue'
import { renderDrawCard, type DrawCardContent } from './drawCard'

/**
 * Share how to mix a vial and how much to draw, as an image for a friend: the peptide, the
 * amount in the vial, the water to add, and the draw for the dose entered, as a number and on
 * the chosen syringe. Figures match the calculator's result exactly; the card is arithmetic on
 * the user's own inputs, never a recommendation.
 */
const props = defineProps<{
  name: string
  vial: Quantity
  diluentMl: number
  dose: Quantity
  plan: DrawPlan
  reading: SyringeReading
  componentDoses: ComponentDose[]
}>()
const open = defineModel<boolean>({ required: true })

const showName = ref(true)

/** Everything on the card except the time it was made, which changes on every draw. */
const figures = computed<Omit<DrawCardContent, 'madeAt'>>(() => {
  const r = props.reading
  const { value, unit } = scaleParts(r)
  return {
    title: showName.value ? props.name : 'Peptide',
    vial: formatQuantity(props.vial),
    water: `${roundTo(props.diluentMl, 3)} mL`,
    concentration: formatConcentration(props.plan.concentration),
    dosesPerVial: props.plan.dosesPerVial,
    dose: formatQuantity(props.dose),
    draw: { value: String(value), unit },
    volume: `${roundTo(props.plan.volumeMl, 3)} mL`,
    syringe: props.reading.syringe,
    volumeMl: props.plan.volumeMl,
    // A blend's contents would name the peptides, so they go with the name. No-break spaces keep
    // each amount with its component when the line wraps.
    components: showName.value
      ? props.componentDoses.map(
          (c) => `${c.name}\u00a0${roundTo(c.dose.value, AMOUNT_DECIMALS.mcg)}\u00a0mcg`,
        )
      : [],
    // Short and about this draw only: the calculator's own warnings run long and some name the
    // peptide, which the name switch promises to leave off.
    warnings: [
      ...(props.plan.volumeMl > props.diluentMl + 1e-9
        ? ['This dose is more than the vial contains.']
        : []),
      ...(!r.fits
        ? [`More than this syringe holds: ${r.fillsNeeded} full draws needed.`]
        : r.belowResolution
          ? ['Too small to measure on this syringe.']
          : []),
    ],
    nearestMark:
      r.fits && !r.belowResolution && r.tickRoundingError > 0.001
        ? `${r.nearestTickValue} ${r.scaleUnit} (${Math.round(r.tickRoundingError * 100)}% off)`
        : null,
  }
})

const renderKey = computed(() => JSON.stringify(figures.value))
const render = () => renderDrawCard({ ...figures.value, madeAt: formatDateTime(nowIso()) })

const fileStem = computed(() => {
  const slug = showName.value ? props.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''
  return `pepcalc-${slug.replace(/^-|-$/g, '') || 'dose'}-draw`
})
</script>

<template>
  <ShareImageDialog
    v-model="open"
    title="Share this draw"
    :file-stem="fileStem"
    :render="render"
    :render-key="renderKey"
  >
    <v-switch v-model="showName" label="Show peptide name" hide-details />
    <p class="text-body-small pc-muted">
      {{
        showName
          ? "Check the numbers against your vial's label before sharing."
          : 'Name and blend contents are hidden.'
      }}
    </p>
  </ShareImageDialog>
</template>
