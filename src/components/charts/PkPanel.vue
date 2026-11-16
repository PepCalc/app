<script setup lang="ts">
import { computed, ref } from 'vue'
import { SOURCE_KIND_LABELS, type SourceRef } from '@/domain/catalog'
import { lookbackHoursFor, type DoseEvent, type PkParameters } from '@/domain/pk'
import { formatHours } from '@/services/time'
import { mdiShareVariantOutline } from '@/plugins/icons'
import MoreInfo from '@/components/common/MoreInfo.vue'
import SourceList from '@/components/common/SourceList.vue'
import PkChart from './PkChart.vue'
import ShareLevelsDialog from './ShareLevelsDialog.vue'

interface PkSource {
  name: string
  pk: (PkParameters & { notes: string; sources: SourceRef[] }) | null
  pkUnavailableReason?: string
}

const props = defineProps<{
  source: PkSource | undefined
  /** User-supplied parameters from a shelf vial; take precedence over the catalog. */
  override: PkParameters | null
  doses: DoseEvent[]
  preview: DoseEvent | null
  unitLabel: string
  now: number
  /** Card title; defaults to a generic one when the page already names the peptide. */
  title?: string
  /** One line under the badges, such as which vials the doses came from. */
  caption?: string
}>()

const params = computed<PkParameters | null>(() => props.override ?? props.source?.pk ?? null)
const userSupplied = computed(() => props.override !== null)

const lookbackHours = computed(() => (params.value ? lookbackHoursFor(params.value) : undefined))

const sharing = ref(false)
const shareName = computed(() => props.title ?? props.source?.name ?? 'Estimated levels')

/** The strongest source behind the curve, so the shared image says where its numbers came from. */
const shareSource = computed(() => {
  if (userSupplied.value) return { text: 'User-supplied values', tone: 'notice' as const }
  // The catalog schema requires a label or trial source for every built-in curve.
  const kinds = props.source?.pk?.sources.map((s) => s.kind) ?? []
  const best = kinds.includes('label') ? 'label' : 'trial'
  return {
    text: `Source: ${SOURCE_KIND_LABELS[best]}`,
    tone: best === 'label' ? ('good' as const) : ('info' as const),
  }
})
</script>

<template>
  <v-card>
    <v-card-item>
      <p class="pc-eyebrow">Estimated levels</p>
      <v-card-title class="text-wrap">{{ title ?? 'Amount in the body over time' }}</v-card-title>
      <template v-if="params && (doses.length || preview)" #append>
        <v-btn
          :icon="mdiShareVariantOutline"
          variant="text"
          aria-label="Share as an image"
          @click="sharing = true"
        />
      </template>
    </v-card-item>
    <v-card-text class="pc-stack">
      <template v-if="params">
        <div class="d-flex flex-wrap ga-2 align-center">
          <span class="pc-badge pc-badge--brand pc-num"
            >half-life {{ formatHours(params.halfLifeHours) }}</span
          >
          <span class="pc-badge pc-badge--brand pc-num"
            >peak {{ formatHours(params.tmaxHours) }}</span
          >
          <span v-if="userSupplied" class="pc-badge pc-badge--notice">
            <span class="pc-badge__dot" />Your own values
          </span>
        </div>
        <p v-if="caption" class="text-body-small pc-muted">{{ caption }}</p>
        <PkChart
          :params="params"
          :doses="doses"
          :preview="preview"
          :unit-label="unitLabel"
          :now="now"
          :lookback-hours="lookbackHours"
        />
        <MoreInfo>
          <p class="text-body-small pc-muted">
            Estimated amount in your body, from the half-life and time to peak.
          </p>
          <SourceList
            v-if="!userSupplied && source?.pk"
            flat
            :sources="source.pk.sources"
            :note="source.pk.notes"
          />
        </MoreInfo>
        <ShareLevelsDialog
          v-model="sharing"
          :input="{ params, doses, preview, unitLabel, now, lookbackHours }"
          :name="shareName"
          :half-life="formatHours(params.halfLifeHours)"
          :peak-time="formatHours(params.tmaxHours)"
          :source="shareSource"
        />
      </template>
      <template v-else>
        <v-alert type="info" variant="tonal" density="comfortable">
          {{
            source?.pkUnavailableReason ??
            'No data for a custom peptide. To see a curve, save the vial and add a half-life.'
          }}
        </v-alert>
      </template>
    </v-card-text>
  </v-card>
</template>
