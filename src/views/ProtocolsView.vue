<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useShelfStore } from '@/stores/shelf'
import { useProtocolsStore } from '@/stores/protocols'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import { useNow } from '@/composables/useNow'
import { usePaging } from '@/composables/usePaging'
import { findPeptide } from '@/data'
import type { DrawRow, ProtocolRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import type { PeptideLevels } from '@/domain/levels'
import { sameProductKey, sortByTime, type SortDirection } from '@/domain/listing'
import { anyDoseInEffect } from '@/domain/pk'
import { OVERLAY_MAX, assignSlots, type OverlayInput } from '@/domain/overlay'
import { roundTo, unitLabel } from '@/domain/units'
import { formatDate, formatDateTime, formatHours, toEpochMs } from '@/services/time'
import DrawList from '@/components/shelf/DrawList.vue'
import PkPanel from '@/components/charts/PkPanel.vue'
import OverlayChart from '@/components/charts/OverlayChart.vue'
import ListPager from '@/components/common/ListPager.vue'
import SourceList from '@/components/common/SourceList.vue'
import SortToggle from '@/components/common/SortToggle.vue'
import ExportReportDialog from '@/components/report/ExportReportDialog.vue'
import ProtocolCard from '@/components/protocols/ProtocolCard.vue'
import ProtocolDialog from '@/components/protocols/ProtocolDialog.vue'
import { mdiFilePdfBox, mdiFilterVariant, mdiPlus } from '@/plugins/icons'

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const confirm = useConfirmStore()
const notify = useNotifyStore()
const now = useNow()

/* Protocols */

/** Peptides on the shelf that do not have a protocol yet. */
const unscheduled = computed(() => protocols.products.filter((p) => !protocols.protocolFor(p.key)))

const editing = ref<ProtocolRow | null>(null)
const dialogOpen = ref(false)

function addProtocol() {
  editing.value = null
  dialogOpen.value = true
}

function editProtocol(p: ProtocolRow) {
  editing.value = p
  dialogOpen.value = true
}

async function saveProtocol(input: NewProtocol) {
  if (editing.value) {
    await protocols.updateProtocol(editing.value.id, {
      intervalHours: input.intervalHours,
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
  const name = protocols.nameFor(p)
  const ok = await confirm.ask({
    title: `Delete the protocol for ${name}?`,
    text: 'Your vials and draws stay as they are.',
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await protocols.deleteProtocol(p.id)
  dialogOpen.value = false
  notify.show('Protocol deleted')
}

/* Estimated levels */

const levelGroups = computed(() => shelf.levelGroups)

const inEffect = (g: PeptideLevels) =>
  g.pk !== null && anyDoseInEffect(g.doses, g.pk.params, now.value)

/** One chart per peptide: amounts and half-lives differ too much to share an axis. */
const charted = computed(() => levelGroups.value.filter(inEffect))
const withoutPk = computed(() => levelGroups.value.filter((g) => !g.pk).map((g) => g.label))
const cleared = computed(() =>
  levelGroups.value.filter((g) => g.pk && !inEffect(g)).map((g) => g.label),
)

/*
 * Overlay: several peptides on one chart. The choice starts with the most recently dosed ones and
 * is kept while the user stays on the page; a peptide keeps its colour as others come and go.
 */
const levelsMode = ref<'separate' | 'overlay'>('separate')
const chosen = ref<string[]>([])
const slots = ref(new Map<string, number>())

watch(
  charted,
  (groups) => {
    const keys = new Set(groups.map((g) => g.key))
    const kept = chosen.value.filter((k) => keys.has(k))
    chosen.value = kept.length ? kept : groups.slice(0, OVERLAY_MAX).map((g) => g.key)
  },
  { immediate: true },
)
watch(chosen, (keys) => (slots.value = assignSlots(keys, slots.value)), { immediate: true })

const overlayInputs = computed<OverlayInput[]>(() =>
  charted.value
    .filter((g) => chosen.value.includes(g.key) && g.pk)
    .map((g) => ({
      key: g.key,
      // A curve from the user's own half-life says so wherever its name appears.
      label: g.pk!.userSupplied ? `${g.label} (your values)` : g.label,
      params: g.pk!.params,
      doses: g.doses,
      unitLabel: unitLabel(g.unit),
    })),
)

/** Where each overlaid curve's half-life and peak come from, shown under the chart. */
const overlaySources = computed(() =>
  charted.value
    .filter((g) => chosen.value.includes(g.key) && g.pk)
    .map((g) => ({
      key: g.key,
      label: g.label,
      params: g.pk!.params,
      userSupplied: g.pk!.userSupplied,
      pk: g.pk!.userSupplied ? null : (findPeptide(g.peptideId)?.pk ?? null),
    })),
)

function captionFor(g: PeptideLevels): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  let text = `${plural(g.doses.length, 'logged dose')} from ${plural(g.vialCount, 'vial')}.`
  if (g.excluded) {
    text += ` Excludes ${plural(g.excluded, 'draw')} that can't be converted to ${unitLabel(g.unit)}.`
  }
  return text
}

/* Draws */

const exporting = ref(false)
const vialNames = computed(() => new Map(shelf.vials.map((v) => [v.id, shelf.displayName(v)])))

/** The peptide each draw belongs to, by vial; draws of a deleted vial have none. */
const drawKey = computed(() => {
  const keyByVial = new Map(shelf.vials.map((v) => [v.id, sameProductKey(v)]))
  return (d: DrawRow) => keyByVial.get(d.vialId)
})

/** Only peptides with draws are worth filtering by. */
const filterItems = computed(() => {
  const withDraws = new Set(shelf.draws.map(drawKey.value))
  return [
    { title: 'All peptides', value: null as string | null },
    ...protocols.products
      .filter((p) => withDraws.has(p.key))
      .map((p) => ({ title: p.name, value: p.key as string | null })),
  ]
})

const filterKey = ref<string | null>(null)
// A filter whose peptide has gone (its vials were deleted) would hide every draw.
watch(filterItems, (items) => {
  if (!items.some((i) => i.value === filterKey.value)) filterKey.value = null
})

const direction = ref<SortDirection>('desc')
const filteredDraws = computed(() =>
  filterKey.value === null
    ? shelf.draws
    : shelf.draws.filter((d) => drawKey.value(d) === filterKey.value),
)
const sortedDraws = computed(() =>
  sortByTime(filteredDraws.value, (d) => toEpochMs(d.takenAt), direction.value),
)
const { state: paging, current: drawPage, reset } = usePaging(sortedDraws)
watch([direction, filterKey], reset)

/**
 * The visible page of draws grouped by local calendar day, in the chosen order. The level charts
 * above use every draw, not just this page or this filter.
 */
const groups = computed(() => {
  const map = new Map<string, DrawRow[]>()
  for (const d of drawPage.value.items) {
    const day = formatDate(d.takenAt)
    const list = map.get(day) ?? []
    list.push(d)
    map.set(day, list)
  }
  return [...map.entries()].map(([day, draws]) => ({ day, draws }))
})

async function deleteDraw(draw: DrawRow) {
  const ok = await confirm.ask({
    title: 'Delete this draw?',
    text: `${roundTo(draw.dose.value, 4)} ${unitLabel(draw.dose.unit)} on ${formatDateTime(draw.takenAt)}`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  await shelf.deleteDraw(draw.id)
  notify.show('Draw deleted')
}
</script>

<template>
  <div class="pc-page protocols">
    <header class="mb-4 d-flex align-end flex-wrap ga-3">
      <div class="flex-grow-1">
        <p class="pc-eyebrow">Your schedule</p>
        <h1 class="pc-display text-headline-large">Protocols</h1>
      </div>
      <v-btn
        v-if="shelf.draws.length"
        variant="tonal"
        color="primary"
        :prepend-icon="mdiFilePdfBox"
        @click="exporting = true"
      >
        Export PDF
      </v-btn>
    </header>
    <ExportReportDialog v-model="exporting" />
    <ProtocolDialog
      v-model="dialogOpen"
      :protocol="editing"
      :products="unscheduled"
      :name="editing ? protocols.nameFor(editing) : undefined"
      @save="saveProtocol"
      @delete="deleteProtocol"
    />

    <section class="mb-6 pc-stack" aria-label="Protocols">
      <v-card v-if="shelf.loaded && !shelf.vials.length" variant="tonal">
        <v-card-text class="pc-stack pc-stack--tight">
          <p><strong>No vials yet.</strong></p>
          <p class="pc-muted">
            Save a vial to your shelf from the calculator, then set how often you take it here.
          </p>
        </v-card-text>
      </v-card>
      <v-card v-else-if="protocols.loaded && !protocols.protocols.length" variant="tonal">
        <v-card-text class="pc-stack pc-stack--tight">
          <p><strong>No protocols yet.</strong></p>
          <p class="pc-muted">
            Set how often you take a peptide to see when your next dose is due.
          </p>
        </v-card-text>
      </v-card>
      <div v-if="protocols.sorted.length" class="protocols-grid">
        <ProtocolCard
          v-for="p in protocols.sorted"
          :key="p.id"
          :protocol="p"
          :now="now"
          @edit="editProtocol"
        />
      </div>
      <div v-if="unscheduled.length">
        <v-btn color="primary" variant="tonal" :prepend-icon="mdiPlus" @click="addProtocol">
          Add a protocol
        </v-btn>
      </div>
    </section>

    <section v-if="levelGroups.length" class="mb-6" aria-labelledby="levels-heading">
      <div class="d-flex align-center flex-wrap ga-3 mb-3">
        <h2 id="levels-heading" class="pc-display text-title-large flex-grow-1">
          Estimated levels
        </h2>
        <v-btn-toggle
          v-if="charted.length > 1"
          v-model="levelsMode"
          mandatory
          density="comfortable"
          role="group"
          aria-label="Chart view"
        >
          <v-btn value="separate">Separate</v-btn>
          <v-btn value="overlay">Overlay</v-btn>
        </v-btn-toggle>
      </div>
      <div class="protocols-levels">
        <v-card v-if="levelsMode === 'overlay' && charted.length > 1">
          <v-card-item>
            <p class="pc-eyebrow">Overlay</p>
            <v-card-title class="text-wrap">Peptides on one chart</v-card-title>
          </v-card-item>
          <v-card-text class="pc-stack">
            <div>
              <p id="overlay-pick-label" class="pc-label">Show up to {{ OVERLAY_MAX }}</p>
              <v-chip-group
                v-model="chosen"
                multiple
                column
                :max="OVERLAY_MAX"
                aria-labelledby="overlay-pick-label"
              >
                <v-chip v-for="g in charted" :key="g.key" :value="g.key" filter variant="outlined">
                  <span
                    v-if="slots.has(g.key)"
                    :class="['overlay-swatch', `overlay-swatch--${slots.get(g.key)! + 1}`]"
                    aria-hidden="true"
                  />
                  {{ g.label }}
                </v-chip>
              </v-chip-group>
            </div>
            <OverlayChart
              v-if="overlayInputs.length"
              :inputs="overlayInputs"
              :slots="slots"
              :now="now"
            />
            <p v-else class="pc-muted">Choose a peptide to show.</p>
            <div v-for="src in overlaySources" :key="src.key" class="pc-stack pc-stack--tight">
              <div class="d-flex flex-wrap ga-2 align-center">
                <strong class="text-body-medium">{{ src.label }}</strong>
                <span class="pc-badge pc-badge--brand pc-num">
                  t½ {{ formatHours(src.params.halfLifeHours) }}
                </span>
                <span class="pc-badge pc-badge--brand pc-num">
                  peak {{ formatHours(src.params.tmaxHours) }}
                </span>
                <span v-if="src.userSupplied" class="pc-badge pc-badge--notice">
                  <span class="pc-badge__dot" />User-supplied values
                </span>
              </div>
              <SourceList v-if="src.pk" :sources="src.pk.sources" />
            </div>
          </v-card-text>
        </v-card>
        <PkPanel
          v-for="g in levelsMode === 'overlay' && charted.length > 1 ? [] : charted"
          :key="g.key"
          :peptide="findPeptide(g.peptideId)"
          :override="g.pk?.userSupplied ? g.pk.params : null"
          :doses="g.doses"
          :preview="null"
          :unit-label="unitLabel(g.unit)"
          :now="now"
          :title="g.label"
          :caption="captionFor(g)"
        />
        <v-card v-if="withoutPk.length || cleared.length" variant="tonal">
          <v-card-text class="text-body-medium pc-stack pc-stack--tight">
            <p v-if="withoutPk.length">
              <strong>No curve for {{ withoutPk.join(', ') }}.</strong> No reliable human data. Add
              a half-life and time to peak on the vial to see one.
            </p>
            <p v-if="cleared.length">
              <strong>Cleared:</strong> {{ cleared.join(', ') }}. Logged doses are estimated to have
              left the body.
            </p>
          </v-card-text>
        </v-card>
      </div>
    </section>

    <section v-if="shelf.draws.length" aria-labelledby="draws-heading">
      <div class="d-flex align-center flex-wrap ga-3 mb-3">
        <h2 id="draws-heading" class="pc-display text-title-large flex-grow-1">Draws</h2>
        <v-select
          v-if="filterItems.length > 2"
          v-model="filterKey"
          :items="filterItems"
          label="Peptide"
          density="compact"
          :prepend-inner-icon="mdiFilterVariant"
          hide-details
          class="protocols-filter"
        />
        <SortToggle v-model="direction" label="Order of draws" />
      </div>
      <v-card v-for="group in groups" :key="group.day" class="mb-4">
        <v-card-item>
          <v-card-title class="text-title-large">{{ group.day }}</v-card-title>
        </v-card-item>
        <v-card-text>
          <DrawList :draws="group.draws" :vial-names="vialNames" @delete="deleteDraw" />
        </v-card-text>
      </v-card>
      <ListPager v-model="paging.page" :current="drawPage" noun="draws" />
    </section>
  </div>
</template>

<style scoped>
.protocols {
  max-width: 760px;
}

.protocols-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.protocols-levels {
  display: grid;
  gap: 16px;
}

.overlay-swatch--1 {
  background: var(--pc-chart-series-1);
}

.overlay-swatch--2 {
  background: var(--pc-chart-series-2);
}

.overlay-swatch--3 {
  background: var(--pc-chart-series-3);
}

.overlay-swatch--4 {
  background: var(--pc-chart-series-4);
}

.overlay-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-inline-end: 6px;
  border-radius: 50%;
}

.protocols-filter {
  flex: 0 1 220px;
}
</style>
