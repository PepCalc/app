<script setup lang="ts">
import { computed } from 'vue'
import type { ProtocolRow } from '@/db/database'
import { levelTrace } from '@/domain/projection'
import { dueState, intervalText, remainingFraction } from '@/domain/schedule'
import { formatAmount, roundTo, unitLabel } from '@/domain/units'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import {
  formatDateTime,
  formatRelativeDays,
  formatTime,
  formatWeekday,
  toEpochMs,
} from '@/services/time'
import { mdiPencilOutline } from '@/plugins/icons'
import LevelBackdrop from '@/components/charts/LevelBackdrop.vue'
import { outlookShort } from '@/components/charts/projectionText'
import DoseCountdown from './DoseCountdown.vue'

/**
 * One protocol: a countdown ring to the next dose, and the last draw of the peptide from any
 * of its vials. The ring is decorative; the line beside it says the same in words.
 */
const props = defineProps<{ protocol: ProtocolRow; now: number }>()
const emit = defineEmits<{ edit: [protocol: ProtocolRow] }>()

const protocols = useProtocolsStore()
const shelf = useShelfStore()

const name = computed(() => protocols.nameFor(props.protocol))
const lastDraw = computed(() => protocols.lastDrawOf(props.protocol))
const dueAt = computed(() => protocols.nextDueOf(props.protocol))

const countdown = computed(() => {
  if (dueAt.value === null) return null
  const { intervalHours } = props.protocol
  return {
    state: dueState(dueAt.value, intervalHours, props.now),
    remaining: remainingFraction(dueAt.value, intervalHours, props.now),
  }
})

const dueText = computed(() => {
  if (!protocols.hasVial(props.protocol)) return `No vial of ${name.value} on your shelf`
  if (dueAt.value === null || !countdown.value) return 'No draw logged yet'
  const at = dueAt.value
  const state = countdown.value.state
  switch (state.kind) {
    case 'later':
      return `Next dose ${formatWeekday(at)}, in ${state.days} day${state.days === 1 ? '' : 's'}`
    case 'soon':
      return `Next dose at ${formatTime(at)}, in about ${state.hours} hour${state.hours === 1 ? '' : 's'}`
    case 'minutes':
      return `Next dose within ${state.minutes} minutes`
    case 'due':
      return 'Your next dose is due'
    case 'late':
      return `Due ${formatRelativeDays(state.days)}`
  }
  return ''
})

/** Names the vial only when the peptide has more than one, where "#2" tells them apart. */
const lastText = computed(() => {
  const d = lastDraw.value
  if (!d) return null
  const vial = shelf.vialById(d.vialId)
  const from =
    vial && shelf.vialNumber(vial) !== undefined ? ` from ${shelf.displayName(vial)}` : ''
  return `${roundTo(d.dose.value, 4)} ${unitLabel(d.dose.unit)}${from}, ${formatDateTime(toEpochMs(d.takenAt))}`
})

/** The card's curve and the line that says the same in words; none before a first draw. */
const levels = computed(() => {
  const found = protocols.projectionOf(props.protocol, props.now)
  if (!found) return null
  const { projection, unit, userSupplied } = found
  const reading = `Est. ${formatAmount(projection.summary.now, unitLabel(unit))} now`
  const own = userSupplied ? ' · User-supplied values' : ''
  return {
    trace: levelTrace(projection, props.now),
    text: `${reading} · ${outlookShort(projection.outlook)}${own}`,
  }
})
</script>

<template>
  <v-card class="protocol-card">
    <LevelBackdrop v-if="levels" :trace="levels.trace" active />
    <v-card-item>
      <v-card-title class="text-wrap">{{ name }}</v-card-title>
      <v-card-subtitle>{{ intervalText(protocol.intervalHours) }}</v-card-subtitle>
      <template #append>
        <v-btn
          :icon="mdiPencilOutline"
          variant="text"
          :aria-label="`Edit protocol for ${name}`"
          @click="emit('edit', protocol)"
        />
      </template>
    </v-card-item>
    <v-card-text class="pc-stack pc-stack--tight">
      <div class="protocol-card__due">
        <DoseCountdown v-if="countdown" :state="countdown.state" :remaining="countdown.remaining" />
        <p class="text-title-medium">{{ dueText }}</p>
      </div>
      <p v-if="lastText" class="pc-muted">
        Last: <span class="pc-num">{{ lastText }}</span>
      </p>
      <p v-if="protocol.notes" class="text-body-small pc-muted">{{ protocol.notes }}</p>
      <p v-if="levels" class="text-body-small pc-muted pc-num">{{ levels.text }}</p>
      <div v-if="levels" class="protocol-card__band" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.protocol-card {
  --level-band: 88px;
  isolation: isolate;
}

/* Keeps text out of the backdrop's line. */
.protocol-card__band {
  height: 64px;
}

.protocol-card__due {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
