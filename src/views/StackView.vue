<script setup lang="ts">
import { computed, ref } from 'vue'
import { anyDoseInEffect } from '@/domain/pk'
import { dueState, dueText, intervalText } from '@/domain/schedule'
import { roundTo, unitLabel } from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { vialAgeFor } from '@/composables/useVialAge'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { daysBetween, formatRelativeDays } from '@/services/time'
import VialAgeBadge from '@/components/shelf/VialAgeBadge.vue'
import { mdiChevronRight, mdiPlus } from '@/plugins/icons'

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const settings = useSettingsStore()
const now = useNow()
const showArchived = ref(false)

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const activeRows = computed(() =>
  protocols.products.flatMap((product) => {
    const active = shelf.vialsOf(product.key).filter((v) => v.status === 'active')
    if (!active.length) return []
    const primary = active[0]!
    const protocol = protocols.protocolFor(product.key)
    const rem = shelf.remainingOf(product.key)
    const age = vialAgeFor(primary, now.value, settings)

    const parts: string[] = []
    if (protocol) parts.push(capitalize(intervalText(protocol.intervalHours)))
    if (rem) {
      const amount = `${roundTo(rem.amount, 3)} ${unitLabel(rem.unit)} left`
      parts.push(rem.vialCount > 1 ? `${rem.vialCount} vials, ${amount}` : amount)
    }
    if (primary.reconstitutedAt) {
      parts.push(`mixed ${formatRelativeDays(daysBetween(primary.reconstitutedAt, now.value))}`)
    }

    let dueLabel = 'No schedule'
    if (protocol) {
      const dueAt = protocols.nextDueOf(protocol)
      dueLabel =
        dueAt !== null ? dueText(dueState(dueAt, protocol.intervalHours, now.value)) : 'No draw yet'
    }

    return [
      {
        key: product.key,
        name: product.name,
        subtitle: parts.join(' · '),
        age,
        dueLabel,
      },
    ]
  }),
)

const archivedRows = computed(() =>
  protocols.products.flatMap((product) => {
    const vials = shelf.vialsOf(product.key)
    if (!vials.length || vials.some((v) => v.status === 'active')) return []
    return [{ key: product.key, name: product.name }]
  }),
)

const chartedCount = computed(
  () =>
    shelf.levelGroups.filter(
      (g) => g.pk !== null && anyDoseInEffect(g.doses, g.pk.params, now.value),
    ).length,
)
</script>

<template>
  <div class="pc-page stack">
    <header class="d-flex align-center flex-wrap ga-3 mb-4">
      <div class="flex-grow-1">
        <p class="pc-eyebrow">Your stack</p>
        <h1 class="pc-display text-headline-large">Stack</h1>
      </div>
      <v-btn :to="{ name: 'calculator' }" color="primary" variant="flat" :prepend-icon="mdiPlus">
        Add a vial
      </v-btn>
    </header>

    <v-card v-if="shelf.loaded && !shelf.vials.length" variant="tonal">
      <v-card-text class="pc-stack pc-stack--tight">
        <p><strong>No vials yet.</strong></p>
        <p class="pc-muted">Save one from the calculator.</p>
      </v-card-text>
    </v-card>

    <template v-else>
      <v-card v-if="activeRows.length">
        <v-list density="comfortable" class="bg-transparent">
          <v-list-item
            v-for="row in activeRows"
            :key="row.key"
            :to="{ name: 'peptide', params: { key: row.key } }"
          >
            <v-list-item-title>{{ row.name }}</v-list-item-title>
            <v-list-item-subtitle class="stack-row__sub pc-num">
              <span>{{ row.subtitle }}</span>
              <VialAgeBadge v-if="row.age && row.age.tier !== 'fresh'" :age="row.age" />
            </v-list-item-subtitle>
            <template #append>
              <span class="text-body-small pc-muted mr-2">{{ row.dueLabel }}</span>
              <v-icon :icon="mdiChevronRight" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>

      <div v-if="chartedCount >= 2" class="mt-4">
        <v-btn :to="{ name: 'levels' }" variant="tonal">Compare levels</v-btn>
      </div>

      <template v-if="archivedRows.length">
        <v-btn variant="text" class="mt-6" @click="showArchived = !showArchived">
          {{ showArchived ? 'Hide' : 'Show' }} archived ({{ archivedRows.length }})
        </v-btn>
        <v-card v-if="showArchived" class="mt-2">
          <v-list density="comfortable" class="bg-transparent">
            <v-list-item
              v-for="row in archivedRows"
              :key="row.key"
              :to="{ name: 'peptide', params: { key: row.key } }"
              :title="row.name"
            >
              <template #append>
                <span class="text-body-small pc-muted mr-2">Archived</span>
                <v-icon :icon="mdiChevronRight" />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </template>
    </template>
  </div>
</template>

<style scoped>
.stack {
  max-width: 760px;
}

.stack-row__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
