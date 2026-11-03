<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useShelfStore } from '@/stores/shelf'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { useNow } from '@/composables/useNow'
import { usePaging } from '@/composables/usePaging'
import { findPeptide } from '@/data'
import type { DrawRow } from '@/db/database'
import type { NewDraw, NewVial } from '@/db/repository'
import { sortByTime, type SortDirection } from '@/domain/listing'
import { concentrationOf } from '@/domain/reconstitution'
import { roundTo, unitLabel } from '@/domain/units'
import { daysBetween, formatDateTime, formatRelativeDays, toEpochMs } from '@/services/time'
import PkPanel from '@/components/charts/PkPanel.vue'
import DrawList from '@/components/shelf/DrawList.vue'
import VialFormDialog from '@/components/shelf/VialFormDialog.vue'
import LogDrawDialog from '@/components/shelf/LogDrawDialog.vue'
import VialAgePanel from '@/components/shelf/VialAgePanel.vue'
import VialAgeBadge from '@/components/shelf/VialAgeBadge.vue'
import { useVialAge } from '@/composables/useVialAge'
import ListPager from '@/components/common/ListPager.vue'
import SortToggle from '@/components/common/SortToggle.vue'
import {
  mdiArchiveArrowDownOutline,
  mdiArchiveArrowUpOutline,
  mdiCalculatorVariantOutline,
  mdiDeleteOutline,
  mdiNeedle,
  mdiPencilOutline,
} from '@/plugins/icons'

const props = defineProps<{ id: string }>()
const router = useRouter()
const shelf = useShelfStore()
const protocols = useProtocolsStore()
const settings = useSettingsStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const now = useNow()

const editing = ref(false)
const logging = ref(false)

/*
 * Edit, archive and delete share the title row. On a phone three labelled buttons leave no room
 * for the name, so below the sm breakpoint they shrink to icons named by aria-label.
 */
const { smAndUp: labelledActions } = useDisplay()
const manageActions = computed(() => {
  const archived = vial.value?.status === 'archived'
  return [
    {
      key: 'edit',
      label: 'Edit',
      icon: mdiPencilOutline,
      color: undefined,
      variant: 'outlined' as const,
      run: () => {
        editing.value = true
      },
    },
    {
      key: 'archive',
      label: archived ? 'Restore to shelf' : 'Archive',
      icon: archived ? mdiArchiveArrowUpOutline : mdiArchiveArrowDownOutline,
      color: undefined,
      variant: 'text' as const,
      run: toggleArchive,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: mdiDeleteOutline,
      color: 'error',
      variant: 'text' as const,
      run: deleteVial,
    },
  ]
})

const vial = computed(() => shelf.vialById(props.id))
const peptide = computed(() => findPeptide(vial.value?.peptideId))
const draws = computed(() => (vial.value ? shelf.drawsFor(vial.value.id) : []))
const balance = computed(() => (vial.value ? shelf.balanceOf(vial.value) : null))
/* The age panel sits low on the page, so a vial nearing or past its limit also says so up top. */
const { age } = useVialAge(vial, now)

const direction = ref<SortDirection>('desc')
const sortedDraws = computed(() =>
  sortByTime(draws.value, (d) => toEpochMs(d.takenAt), direction.value),
)
const { state: paging, current: drawPage, reset } = usePaging(sortedDraws)
watch(direction, reset)

/** Chart unit: the usual dose unit, else the unit of the latest draw, else the vial's unit. */
const chartUnit = computed(
  () => vial.value?.typicalDose?.unit ?? draws.value[0]?.dose.unit ?? vial.value?.unit ?? 'mg',
)
/** Doses of this peptide from every vial, so the curve matches the Protocols tab. */
const pooled = computed(() =>
  vial.value ? shelf.pooledDosesFor(vial.value, chartUnit.value) : { doses: [], vialCount: 0 },
)
const pooledCaption = computed(() =>
  pooled.value.vialCount > 1 ? `Includes doses from ${pooled.value.vialCount} vials.` : undefined,
)

const concentrationText = computed(() => {
  if (!vial.value) return ''
  const c = concentrationOf(
    { value: vial.value.amount, unit: vial.value.unit },
    vial.value.diluentMl,
  )
  return `${roundTo(c.perMl, 4)} ${unitLabel(c.unit)}/mL`
})

async function saveVial(changes: Partial<NewVial>) {
  if (!vial.value) return
  await shelf.updateVial(vial.value.id, changes)
  // A rename can carry the peptide's protocol to the new name.
  await protocols.load()
  notify.show('Vial updated', 'success')
}

async function saveDraw(draw: NewDraw) {
  await shelf.addDraw(draw)
  notify.show('Draw logged', 'success')
}

async function deleteDraw(draw: DrawRow) {
  const ok = await confirm.ask({
    title: 'Delete this draw?',
    text: `${roundTo(draw.dose.value, 4)} ${unitLabel(draw.dose.unit)} on ${formatDateTime(draw.takenAt)} will be added back to the vial.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await shelf.deleteDraw(draw.id)
  notify.show('Draw deleted')
}

async function toggleArchive() {
  if (!vial.value) return
  const archived = vial.value.status === 'archived'
  await shelf.updateVial(vial.value.id, { status: archived ? 'active' : 'archived' })
  notify.show(archived ? 'Vial restored to shelf' : 'Vial archived')
}

async function deleteVial() {
  if (!vial.value) return
  const ok = await confirm.ask({
    title: `Delete ${shelf.displayName(vial.value)}?`,
    text: `This permanently deletes the vial and its ${draws.value.length} logged draws. To keep them, archive it instead.`,
    confirmText: 'Delete vial',
    destructive: true,
  })
  if (!ok) return
  await shelf.deleteVial(vial.value.id)
  notify.show('Vial deleted')
  await router.replace({ name: 'shelf' })
}
</script>

<template>
  <div class="pc-page">
    <template v-if="vial && balance">
      <header class="mb-4">
        <p class="pc-eyebrow">{{ vial.status === 'archived' ? 'Archived vial' : 'Vial' }}</p>
        <div class="vial-title-row">
          <h1 class="vial-title pc-display text-headline-large">{{ shelf.displayName(vial) }}</h1>
          <div class="vial-manage" aria-label="Manage vial" role="group">
            <template v-for="action in manageActions" :key="action.key">
              <v-btn
                v-if="labelledActions"
                :prepend-icon="action.icon"
                :color="action.color"
                :variant="action.variant"
                @click="action.run"
              >
                {{ action.label }}
              </v-btn>
              <v-btn
                v-else
                :icon="action.icon"
                :color="action.color"
                :aria-label="action.label"
                variant="text"
                @click="action.run"
              />
            </template>
          </div>
        </div>
        <div>
          <p class="pc-muted pc-num">
            {{ vial.amount }} {{ unitLabel(vial.unit) }} in {{ vial.diluentMl }} mL ·
            {{ concentrationText }}
            <template v-if="vial.reconstitutedAt">
              · mixed {{ formatRelativeDays(daysBetween(vial.reconstitutedAt, now)) }}
            </template>
          </p>
          <div v-if="age && age.tier !== 'fresh'" class="mt-2"><VialAgeBadge :age="age" /></div>
        </div>
      </header>

      <div class="vial-layout">
        <div class="d-flex flex-column ga-4">
          <v-card>
            <v-card-item>
              <p class="pc-eyebrow">Remaining</p>
            </v-card-item>
            <v-card-text class="pc-stack">
              <div>
                <p class="vial-remaining pc-num">
                  {{ roundTo(balance.remainingAmount, 3) }}
                  <span class="text-title-large">{{ unitLabel(vial.unit) }}</span>
                </p>
                <p class="pc-muted pc-num">
                  {{ roundTo(balance.remainingMl, 2) }} mL of liquid
                  <template v-if="balance.dosesLeft !== null">
                    · about {{ balance.dosesLeft }} doses of {{ vial.typicalDose?.value }}
                    {{ unitLabel(vial.typicalDose?.unit ?? vial.unit) }}
                  </template>
                </p>
              </div>
              <v-progress-linear
                :model-value="(1 - balance.usedFraction) * 100"
                color="primary"
                bg-color="surface-variant"
                bg-opacity="1"
                height="10"
                rounded
                aria-label="Share of vial remaining"
              />
              <v-alert v-if="balance.overdrawn" type="warning" variant="tonal" density="compact">
                Logged draws exceed the vial amount. Check the amount or delete a wrong entry.
              </v-alert>
              <p v-if="vial.components" class="text-body-small pc-muted">
                Blend: {{ vial.components.map((c) => `${c.name} ${c.amountMg} mg`).join(', ') }}
              </p>
              <p v-if="vial.notes" class="text-body-medium">{{ vial.notes }}</p>
            </v-card-text>
            <v-card-actions>
              <v-btn
                color="primary"
                variant="flat"
                :prepend-icon="mdiNeedle"
                @click="logging = true"
              >
                Log a draw
              </v-btn>
              <v-btn
                :to="{ name: 'calculator', query: { vial: vial.id } }"
                variant="text"
                :prepend-icon="mdiCalculatorVariantOutline"
              >
                Calculator
              </v-btn>
            </v-card-actions>
          </v-card>

          <v-card>
            <v-card-item>
              <p class="pc-eyebrow">History</p>
              <v-card-title
                >{{ draws.length }} draw{{ draws.length === 1 ? '' : 's' }}</v-card-title
              >
            </v-card-item>
            <v-card-text class="pc-stack">
              <p v-if="!draws.length" class="pc-muted">No draws logged yet.</p>
              <template v-else>
                <SortToggle v-if="draws.length > 1" v-model="direction" label="Order of draws" />
                <DrawList :draws="drawPage.items" @delete="deleteDraw" />
                <ListPager v-model="paging.page" :current="drawPage" noun="draws" />
              </template>
            </v-card-text>
          </v-card>
        </div>

        <div class="d-flex flex-column ga-4">
          <PkPanel
            :peptide="peptide"
            :override="vial.pkOverride"
            :doses="pooled.doses"
            :preview="null"
            :unit-label="unitLabel(chartUnit)"
            :now="now"
            :caption="pooledCaption"
          />
          <VialAgePanel :vial="vial" :now="now" @edit="editing = true" />
        </div>
      </div>

      <VialFormDialog v-model="editing" :vial="vial" @save="saveVial" />
      <LogDrawDialog
        v-model="logging"
        :vial="vial"
        :default-syringe-id="settings.defaultSyringeId"
        @save="saveDraw"
      />
    </template>

    <v-card v-else-if="shelf.loaded" variant="tonal">
      <v-card-text>
        This vial is not on this device.
        <v-btn :to="{ name: 'shelf' }" variant="text">Back to shelf</v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.vial-layout {
  display: grid;
  gap: 16px;
}

@media (min-width: 840px) {
  .vial-layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
  }
}

.vial-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/*
 * A name too long to sit beside the actions takes the whole row and the actions drop to the
 * next line, still at the right; a word breaks only if it cannot fit a line on its own.
 */
.vial-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: break-word;
}

.vial-manage {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  margin-inline-start: auto;
}

.vial-remaining {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
</style>
