<script setup lang="ts">
import { computed, ref } from 'vue'
import { findPeptide } from '@/data'
import type { ProtocolRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import { levelKey, levelsCaption } from '@/domain/levels'
import {
  courseText,
  dueState,
  dueText,
  lastDrawFor,
  remainingFraction,
  scheduleText,
} from '@/domain/schedule'
import { formatQuantity, roundTo, unitLabel } from '@/domain/units'
import { CUSTOM_PEPTIDE } from '@/composables/useCalculator'
import { useEntries } from '@/composables/useEntries'
import { useNow } from '@/composables/useNow'
import {
  formatDateTime,
  formatTimeOfDay,
  localCalendar,
  toEpochMs,
  weekdayName,
} from '@/services/time'
import { useConfirmStore } from '@/stores/confirm'
import { useLogStore } from '@/stores/log'
import { useNotifyStore } from '@/stores/notify'
import { useProtocolsStore } from '@/stores/protocols'
import { useShelfStore } from '@/stores/shelf'
import PkPanel from '@/components/charts/PkPanel.vue'
import EntriesTimeline from '@/components/journal/EntriesTimeline.vue'
import DoseCountdown from '@/components/protocols/DoseCountdown.vue'
import ProtocolDialog from '@/components/protocols/ProtocolDialog.vue'
import VialCard from '@/components/shelf/VialCard.vue'
import {
  mdiCalculatorVariantOutline,
  mdiChevronLeft,
  mdiNeedle,
  mdiPencilOutline,
  mdiPlus,
} from '@/plugins/icons'

const props = defineProps<{ peptideKey: string }>()

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const log = useLogStore()
const confirm = useConfirmStore()
const notify = useNotifyStore()
const now = useNow()
const { entries } = useEntries()

const dialogOpen = ref(false)

const vials = computed(() => shelf.vialsOf(props.peptideKey))
const activeVials = computed(() => vials.value.filter((v) => v.status === 'active'))
const peptide = computed(() => findPeptide(props.peptideKey))
const name = computed(
  () =>
    protocols.products.find((p) => p.key === props.peptideKey)?.name ??
    peptide.value?.name ??
    vials.value[0]?.name ??
    '',
)

const protocol = computed(() => protocols.protocolFor(props.peptideKey))
const drawVial = computed(() =>
  protocol.value ? protocols.drawVialOf(protocol.value) : activeVials.value[0],
)
const lastDraw = computed(() => lastDrawFor(props.peptideKey, shelf.vials, shelf.draws))
const dueAt = computed(() =>
  protocol.value ? protocols.nextDueOf(protocol.value, now.value) : null,
)

const countdown = computed(() => {
  if (!protocol.value || dueAt.value === null) return null
  const gap = protocols.gapOf(protocol.value, dueAt.value)
  return {
    state: dueState(dueAt.value, gap, now.value),
    remaining: remainingFraction(dueAt.value, gap, now.value),
  }
})

const scheduleHeading = computed(() => {
  if (!protocol.value) return ''
  const text = scheduleText(protocol.value.schedule, formatTimeOfDay, weekdayName)
  return text.charAt(0).toUpperCase() + text.slice(1)
})

const dueLabel = computed(() => {
  if (!protocol.value || protocol.value.schedule.kind === 'asNeeded') return ''
  if (dueAt.value === null || !countdown.value) return 'No draw logged yet'
  return dueText(countdown.value.state)
})

const courseLabel = computed(() =>
  protocol.value ? courseText(protocol.value.course, now.value, localCalendar) : null,
)

const plannedLabel = computed(() =>
  protocol.value?.plannedDose ? `Planned: ${formatQuantity(protocol.value.plannedDose)}` : null,
)

const lastText = computed(() => {
  const d = lastDraw.value
  if (!d) return null
  const vial = shelf.vialById(d.vialId)
  const from =
    vial && shelf.vialNumber(vial) !== undefined ? ` from ${shelf.displayName(vial)}` : ''
  return `${roundTo(d.dose.value, 4)} ${unitLabel(d.dose.unit)}${from}, ${formatDateTime(toEpochMs(d.takenAt))}`
})

const pkVial = computed(() => vials.value.find((v) => shelf.pkFor(v) !== null) ?? vials.value[0])
const levelGroup = computed(() => {
  if (!pkVial.value) return undefined
  const key = levelKey(pkVial.value)
  return shelf.levelGroups.find((g) => g.key === key)
})
const chartUnit = computed(
  () =>
    levelGroup.value?.unit ??
    lastDraw.value?.dose.unit ??
    pkVial.value?.typicalDose?.unit ??
    pkVial.value?.unit ??
    'mg',
)
const pooled = computed(() =>
  pkVial.value ? shelf.pooledDosesFor(pkVial.value, chartUnit.value) : { doses: [], vialCount: 0 },
)
const levelCaption = computed(() => {
  const g = levelGroup.value
  if (!g) return undefined
  return levelsCaption(g, unitLabel(g.unit))
})

const vialIds = computed(() => new Set(vials.value.map((v) => v.id)))
const drawIds = computed(
  () => new Set(shelf.draws.filter((d) => vialIds.value.has(d.vialId)).map((d) => d.id)),
)
const drawEntries = computed(() =>
  entries.value.filter((e) => e.kind === 'dose' && drawIds.value.has(e.id)),
)

const dialogProducts = computed(() => [{ key: props.peptideKey, name: name.value }])

async function saveProtocol(input: NewProtocol) {
  if (protocol.value) {
    await protocols.updateProtocol(protocol.value.id, {
      schedule: input.schedule,
      plannedDose: input.plannedDose,
      course: input.course,
      notes: input.notes,
    })
    notify.show('Protocol saved')
  } else {
    await protocols.addProtocol(input)
    notify.show(`Protocol added for ${input.name}`)
  }
  dialogOpen.value = false
}

async function deleteProtocol(p: ProtocolRow) {
  const ok = await confirm.ask({
    title: `Delete the protocol for ${name.value}?`,
    text: 'Your vials and draws stay as they are.',
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await protocols.deleteProtocol(p.id)
  dialogOpen.value = false
  notify.show('Protocol deleted')
}
</script>

<template>
  <div class="pc-page">
    <template v-if="vials.length">
      <header class="mb-4">
        <v-btn :to="{ name: 'stack' }" variant="text" :prepend-icon="mdiChevronLeft" class="mb-2">
          Stack
        </v-btn>
        <p class="pc-eyebrow">Peptide</p>
        <h1 class="pc-display text-headline-large">{{ name }}</h1>
        <p v-if="peptide?.summary" class="text-body-medium pc-muted mt-1">{{ peptide.summary }}</p>
      </header>

      <div class="peptide-layout">
        <div class="d-flex flex-column ga-4">
          <v-card>
            <v-card-item>
              <p class="pc-eyebrow">Schedule</p>
              <v-card-title v-if="protocol">{{ scheduleHeading }}</v-card-title>
            </v-card-item>
            <v-card-text class="pc-stack">
              <template v-if="protocol">
                <div v-if="dueLabel" class="peptide-due">
                  <DoseCountdown
                    v-if="countdown"
                    :state="countdown.state"
                    :remaining="countdown.remaining"
                  />
                  <p class="text-title-medium">{{ dueLabel }}</p>
                </div>
                <p v-if="plannedLabel || courseLabel" class="pc-muted pc-num">
                  {{ [plannedLabel, courseLabel].filter(Boolean).join(' · ') }}
                </p>
                <p v-if="lastText" class="pc-muted">
                  Last: <span class="pc-num">{{ lastText }}</span>
                </p>
                <p v-if="protocol.notes" class="text-body-small pc-muted">{{ protocol.notes }}</p>
              </template>
              <p v-else class="pc-muted">Set how often you take it.</p>

              <div class="d-flex flex-wrap ga-2">
                <v-btn
                  v-if="drawVial"
                  color="primary"
                  variant="flat"
                  :prepend-icon="mdiNeedle"
                  @click="log.start('dose', { vialId: drawVial.id })"
                >
                  Log a draw
                </v-btn>
                <v-btn
                  v-if="drawVial"
                  :to="{ name: 'calculator', query: { vial: drawVial.id } }"
                  :prepend-icon="mdiCalculatorVariantOutline"
                  variant="tonal"
                >
                  Calculate
                </v-btn>
                <v-btn
                  variant="text"
                  :prepend-icon="protocol ? mdiPencilOutline : mdiPlus"
                  @click="dialogOpen = true"
                >
                  {{ protocol ? 'Edit schedule' : 'Add a schedule' }}
                </v-btn>
              </div>
            </v-card-text>
          </v-card>

          <section class="pc-stack pc-stack--tight">
            <h2 class="pc-display text-title-large">Vials</h2>
            <VialCard
              v-for="vial in vials"
              :key="vial.id"
              :vial="vial"
              :balance="shelf.balanceOf(vial)"
              :title="shelf.displayName(vial)"
              :now="now"
            />
            <div>
              <v-btn
                :to="{
                  name: 'calculator',
                  query: { peptide: peptide ? peptide.id : CUSTOM_PEPTIDE },
                }"
                variant="tonal"
                :prepend-icon="mdiPlus"
              >
                Add another vial
              </v-btn>
            </div>
          </section>
        </div>

        <div class="d-flex flex-column ga-4">
          <PkPanel
            :source="peptide"
            :override="pkVial?.pkOverride ?? null"
            :doses="pooled.doses"
            :preview="null"
            :unit-label="unitLabel(chartUnit)"
            :now="now"
            :title="name"
            :caption="levelCaption"
          />

          <section class="pc-stack pc-stack--tight">
            <h2 class="pc-display text-title-large">Draws</h2>
            <EntriesTimeline :entries="drawEntries" :kinds="['dose']" />
          </section>
        </div>
      </div>

      <ProtocolDialog
        v-model="dialogOpen"
        :protocol="protocol ?? null"
        :products="dialogProducts"
        :name="name"
        @save="saveProtocol"
        @delete="deleteProtocol"
      />
    </template>

    <v-card v-else-if="shelf.loaded" variant="tonal">
      <v-card-text>
        This peptide is not on your shelf.
        <v-btn :to="{ name: 'calculator' }" variant="text">Open calculator</v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.peptide-layout {
  display: grid;
  gap: 16px;
}

@media (min-width: 840px) {
  .peptide-layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
  }
}

.peptide-due {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
