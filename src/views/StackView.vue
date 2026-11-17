<script setup lang="ts">
import { computed, ref } from 'vue'
import { dueToneFor, type DueTone } from '@/domain/due'
import { shelfNotices } from '@/domain/inventory'
import { anyDoseInEffect, levelNow } from '@/domain/pk'
import { dueState, dueText, lastDrawFor, scheduleText } from '@/domain/schedule'
import {
  areCompatible,
  convert,
  formatAmount,
  formatQuantity,
  roundTo,
  unitLabel,
} from '@/domain/units'
import { useNow } from '@/composables/useNow'
import { vialAgeFor, type VialAge } from '@/composables/useVialAge'
import { useLogStore } from '@/stores/log'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import {
  daysBetween,
  formatDay,
  formatRelativeDays,
  formatTimeOfDay,
  toEpochMs,
  weekdayName,
} from '@/services/time'
import VialAgeBadge from '@/components/shelf/VialAgeBadge.vue'
import { mdiCalculatorVariantOutline, mdiChevronRight, mdiNeedle, mdiPlus } from '@/plugins/icons'

const shelf = useShelfStore()
const protocols = useProtocolsStore()
const settings = useSettingsStore()
const log = useLogStore()
const now = useNow()
const showArchived = ref(false)

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function badgeClassFor(tone: DueTone): string {
  switch (tone) {
    case 'brand':
      return 'pc-badge--brand'
    case 'notice':
      return 'pc-badge--notice'
    case 'alert':
      return 'pc-badge--alert'
    default:
      return ''
  }
}

const activeNoticesByVial = computed(() => {
  const balances = new Map(shelf.activeVials.map((v) => [v.id, shelf.balanceOf(v)]))
  const ages = new Map<string, VialAge | null>(
    shelf.activeVials.map((v) => [v.id, vialAgeFor(v, now.value, settings)]),
  )
  const vials = shelf.activeVials.map((v) => ({
    id: v.id,
    name: shelf.displayName(v),
    status: v.status,
  }))
  const notices = shelfNotices(vials, balances, ages)
  const byVial = new Map<string, typeof notices>()
  for (const notice of notices) {
    if (notice.kind === 'age') continue
    const list = byVial.get(notice.vialId) ?? []
    list.push(notice)
    byVial.set(notice.vialId, list)
  }
  return byVial
})

const activeRows = computed(() =>
  protocols.products.flatMap((product) => {
    const active = shelf.vialsOf(product.key).filter((v) => v.status === 'active')
    if (!active.length) return []
    const primary = active[0]!
    const protocol = protocols.protocolFor(product.key)
    const rem = shelf.remainingOf(product.key)
    const age = vialAgeFor(primary, now.value, settings)

    let scheduleLine = 'No schedule yet'
    if (protocol) {
      const text = capitalize(scheduleText(protocol.schedule, formatTimeOfDay, weekdayName))
      scheduleLine = protocol.plannedDose
        ? `${text} · Planned ${formatQuantity(protocol.plannedDose)}`
        : text
    }

    let dueLabel = ''
    let dueTone: DueTone = 'muted'
    if (protocol) {
      if (protocol.schedule.kind === 'asNeeded') {
        dueLabel = 'As needed'
      } else {
        const dueAt = protocols.nextDueOf(protocol, now.value)
        if (dueAt !== null) {
          const state = dueState(dueAt, protocols.gapOf(protocol, dueAt), now.value)
          dueLabel = dueText(state)
          dueTone = dueToneFor(state.kind)
        } else {
          dueLabel = 'No draw yet'
        }
      }
    }

    let remainingText = ''
    let dosesLeftText: string | null = null
    let remainingPct = 100
    let meterColor: 'primary' | 'warning' | 'error' = 'primary'
    if (rem) {
      const unitStr = unitLabel(rem.unit)
      const amount = `${roundTo(rem.amount, 3)} ${unitStr} left`
      remainingText = rem.vialCount > 1 ? `${rem.vialCount} vials · ${amount}` : amount

      let totalCapacity = 0
      let totalDosesLeft = 0
      let hasDoseCount = false
      for (const v of active) {
        if (areCompatible(v.unit, rem.unit)) {
          totalCapacity += convert({ value: v.amount, unit: v.unit }, rem.unit).value
        }
        const bal = shelf.balanceOf(v)
        if (bal.dosesLeft !== null) {
          totalDosesLeft += bal.dosesLeft
          hasDoseCount = true
        }
      }
      remainingPct =
        totalCapacity > 0
          ? Math.min(100, Math.max(0, Math.round((rem.amount / totalCapacity) * 100)))
          : 0
      meterColor = remainingPct <= 10 ? 'error' : remainingPct <= 25 ? 'warning' : 'primary'
      if (hasDoseCount) dosesLeftText = `~${totalDosesLeft} doses`
    }

    const last = lastDrawFor(product.key, shelf.vials, shelf.draws)
    let lastText: string | null = null
    if (last) {
      const day = formatDay(toEpochMs(last.takenAt), now.value)
      const when = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
      lastText = `Last: ${formatQuantity(last.dose)}, ${when}`
    }

    const levels = protocols.levelsOf(product.key)
    let inSystemText: string | null = null
    if (
      levels?.pk &&
      levels.history.length &&
      anyDoseInEffect(levels.history, levels.pk.params, now.value)
    ) {
      const { amount, percentOfPeak } = levelNow(levels.history, levels.pk.params, now.value)
      inSystemText = `In system: ${formatAmount(amount, unitLabel(levels.unit))} (${percentOfPeak}% of peak)`
    }

    const vialAlerts = active.flatMap((v) => activeNoticesByVial.value.get(v.id) ?? [])

    return [
      {
        key: product.key,
        name: product.name,
        primaryVialId: primary.id,
        scheduleLine,
        dueLabel,
        dueTone,
        remainingText,
        dosesLeftText,
        remainingPct,
        meterColor,
        mixedText: primary.reconstitutedAt
          ? `Mixed ${formatRelativeDays(daysBetween(primary.reconstitutedAt, now.value))}`
          : 'Unmixed',
        age,
        vialAlerts,
        lastText,
        inSystemText,
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
  <div class="pc-page">
    <header class="stack-header mb-4">
      <div class="flex-grow-1">
        <h1 class="pc-display text-headline-large">Stack</h1>
      </div>
      <div class="d-flex flex-wrap ga-2">
        <v-btn v-if="chartedCount >= 2" :to="{ name: 'levels' }" variant="tonal">
          Compare levels
        </v-btn>
        <v-btn :to="{ name: 'calculator' }" color="primary" variant="flat" :prepend-icon="mdiPlus">
          Add a vial
        </v-btn>
      </div>
    </header>

    <v-card v-if="shelf.loaded && !shelf.vials.length" variant="tonal">
      <v-card-text class="pc-stack pc-stack--tight">
        <p><strong>No vials yet.</strong></p>
        <p class="pc-muted">Save one from the calculator.</p>
      </v-card-text>
    </v-card>

    <template v-else>
      <div v-if="activeRows.length" class="stack-grid">
        <v-card v-for="row in activeRows" :key="row.key" class="stack-card">
          <v-card-text class="stack-card__body pc-stack">
            <router-link
              :to="{ name: 'peptide', params: { key: row.key } }"
              class="stack-card__head"
            >
              <div class="stack-card__title-block">
                <span class="stack-card__title pc-display">{{ row.name }}</span>
                <span class="text-body-small pc-muted">{{ row.scheduleLine }}</span>
              </div>
              <div class="stack-card__head-end">
                <span v-if="row.dueLabel" :class="['pc-badge', badgeClassFor(row.dueTone)]">
                  <span v-if="row.dueTone !== 'muted'" class="pc-badge__dot" />{{ row.dueLabel }}
                </span>
                <v-icon :icon="mdiChevronRight" class="pc-muted" />
              </div>
            </router-link>

            <div v-if="row.remainingText" class="pc-stack pc-stack--tight">
              <div class="d-flex justify-space-between align-baseline flex-wrap ga-2 pc-num">
                <span class="text-body-medium">
                  <strong>{{ row.remainingText }}</strong>
                </span>
                <span v-if="row.dosesLeftText" class="text-body-small pc-muted">
                  {{ row.dosesLeftText }}
                </span>
              </div>
              <v-progress-linear
                :model-value="row.remainingPct"
                :color="row.meterColor"
                bg-color="surface-variant"
                bg-opacity="1"
                height="8"
                rounded
                :aria-label="`${row.remainingPct}% remaining`"
              />
            </div>

            <div class="stack-card__meta">
              <VialAgeBadge v-if="row.age" :age="row.age" />
              <span v-else class="text-body-small pc-muted">{{ row.mixedText }}</span>
              <span
                v-for="alert in row.vialAlerts"
                :key="alert.id"
                :class="['pc-badge', `pc-badge--${alert.tone}`]"
              >
                <span class="pc-badge__dot" />{{ alert.text }}
              </span>
            </div>

            <div
              v-if="row.inSystemText || row.lastText"
              class="pc-stack pc-stack--tight text-body-small pc-muted pc-num"
            >
              <p v-if="row.inSystemText">{{ row.inSystemText }}</p>
              <p v-if="row.lastText">{{ row.lastText }}</p>
            </div>

            <div class="stack-card__actions">
              <v-btn
                variant="text"
                :prepend-icon="mdiCalculatorVariantOutline"
                :to="{ name: 'calculator', query: { vial: row.primaryVialId } }"
              >
                Calculate
              </v-btn>
              <v-btn
                color="primary"
                variant="tonal"
                :prepend-icon="mdiNeedle"
                @click="log.start('dose', { vialId: row.primaryVialId })"
              >
                Log a draw
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <template v-if="archivedRows.length">
        <v-btn variant="text" class="mt-6" @click="showArchived = !showArchived">
          {{ showArchived ? 'Hide' : 'Show' }} archived ({{ archivedRows.length }})
        </v-btn>
        <v-card v-if="showArchived" variant="tonal" class="mt-2 stack-archived">
          <v-list density="compact" class="bg-transparent">
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
.stack-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.stack-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

@media (min-width: 840px) {
  .stack-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.stack-card__body {
  height: 100%;
}

.stack-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.stack-card__head:hover .stack-card__title {
  text-decoration: underline;
}

.stack-card__title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stack-card__title {
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--pc-text-1);
}

.stack-card__head-end {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.stack-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.stack-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.stack-archived {
  max-width: 760px;
}
</style>
