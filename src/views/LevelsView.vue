<script setup lang="ts">
import { computed, watch } from 'vue'
import { findPeptide } from '@/data'
import type { PeptideLevels } from '@/domain/levels'
import { OVERLAY_MAX, type OverlayInput } from '@/domain/overlay'
import { anyDoseInEffect } from '@/domain/pk'
import { unitLabel } from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { useLevelPickStore } from '@/stores/levelPick'
import { useShelfStore } from '@/stores/shelf'
import { formatHours } from '@/services/time'
import OverlayChart from '@/components/charts/OverlayChart.vue'
import MoreInfo from '@/components/common/MoreInfo.vue'
import SourceList from '@/components/common/SourceList.vue'
import { mdiChevronLeft } from '@/plugins/icons'

const shelf = useShelfStore()
const levelPick = useLevelPickStore()
const now = useNow()

const levelGroups = computed(() => shelf.levelGroups)
const inEffect = (g: PeptideLevels) =>
  g.pk !== null && anyDoseInEffect(g.doses, g.pk.params, now.value)

const charted = computed(() => levelGroups.value.filter(inEffect))
const withoutPk = computed(() => levelGroups.value.filter((g) => !g.pk).map((g) => g.label))
const cleared = computed(() =>
  levelGroups.value.filter((g) => g.pk && !inEffect(g)).map((g) => g.label),
)

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
      label: g.pk!.userSupplied ? `${g.label} (your values)` : g.label,
      params: g.pk!.params,
      doses: g.doses,
      unitLabel: unitLabel(g.unit),
    })),
)

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
</script>

<template>
  <div class="pc-page levels">
    <header class="mb-4">
      <v-btn :to="{ name: 'stack' }" variant="text" :prepend-icon="mdiChevronLeft" class="mb-2">
        Stack
      </v-btn>
      <p class="pc-eyebrow">Comparison</p>
      <h1 class="pc-display text-headline-large">Compare levels</h1>
    </header>

    <div class="pc-stack">
      <v-card v-if="charted.length < 2" variant="tonal">
        <v-card-text class="pc-stack pc-stack--tight">
          <p>Log draws for two or more peptides with level curves to compare them here.</p>
          <div>
            <v-btn :to="{ name: 'stack' }" variant="text">Back to stack</v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card v-else>
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

      <v-card v-if="withoutPk.length || cleared.length" variant="tonal">
        <v-card-text class="text-body-medium pc-stack pc-stack--tight">
          <p v-if="withoutPk.length">
            <strong>No curve for {{ withoutPk.join(', ') }}.</strong> No reliable human data. Add a
            half-life and time to peak on the vial to see one.
          </p>
          <p v-if="cleared.length"><strong>Cleared:</strong> {{ cleared.join(', ') }}.</p>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.levels {
  max-width: 760px;
}
</style>
