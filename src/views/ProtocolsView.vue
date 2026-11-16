<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useShelfStore } from '@/stores/shelf'
import { useProtocolsStore } from '@/stores/protocols'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import { useNow } from '@/composables/useNow'
import { findPeptide } from '@/data'
import type { ProtocolRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import type { PeptideLevels } from '@/domain/levels'
import { anyDoseInEffect } from '@/domain/pk'
import { OVERLAY_MAX, type OverlayInput } from '@/domain/overlay'
import { useLevelPickStore } from '@/stores/levelPick'
import { unitLabel } from '@/domain/units'
import { formatHours } from '@/services/time'
import PkPanel from '@/components/charts/PkPanel.vue'
import OverlayChart from '@/components/charts/OverlayChart.vue'
import MoreInfo from '@/components/common/MoreInfo.vue'
import SourceList from '@/components/common/SourceList.vue'
import ExportReportDialog from '@/components/report/ExportReportDialog.vue'
import ProtocolCard from '@/components/protocols/ProtocolCard.vue'
import ProtocolDialog from '@/components/protocols/ProtocolDialog.vue'
import { mdiFilePdfBox, mdiPlus } from '@/plugins/icons'

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
 * is kept while the app is open; a peptide keeps its colour as others come and go.
 */
const levelsMode = ref<'separate' | 'overlay'>('separate')
// Shared with the trend card, so a peptide keeps its pick and colour on both.
const levelPick = useLevelPickStore()
const chosen = computed({
  get: () => levelPick.picked(charted.value.map((g) => g.key)),
  set: (keys: string[]) => levelPick.choose(keys),
})
const slots = computed(() => levelPick.slots)
watch(chosen, (keys) => levelPick.assign(keys), { immediate: true })

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

const exporting = ref(false)
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
                    :class="['pc-swatch', `pc-swatch--${slots.get(g.key)! + 1}`]"
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
            <MoreInfo v-if="overlayInputs.length">
              <p class="text-body-small pc-muted">
                Estimated levels, each scaled to its own peak to compare timing. Tap a line for its
                amount.
              </p>
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
                <SourceList v-if="src.pk" flat :sources="src.pk.sources" />
              </div>
            </MoreInfo>
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
            <p v-if="cleared.length"><strong>Cleared:</strong> {{ cleared.join(', ') }}.</p>
          </v-card-text>
        </v-card>
      </div>
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
</style>
