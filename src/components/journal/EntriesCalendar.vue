<script setup lang="ts">
import { computed, ref } from 'vue'
import { brand } from '@/brand'
import type { Entry, EntryKind } from '@/domain/entries'
import {
  dayMarkText,
  hasLoggedEntries,
  markDays,
  withScheduled,
  type DayMark,
} from '@/domain/entryDays'
import { useNow } from '@/composables/useNow'
import {
  atLocalTime,
  calendarFirstDayOfWeek,
  dateOfDay,
  dayOfDate,
  dayOfIsoDate,
  formatDay,
  formatMonth,
  monthStartOf,
  monthYearOf,
} from '@/services/time'
import { mdiChevronLeft, mdiChevronRight } from '@/plugins/icons'

const props = withDefaults(
  defineProps<{
    entries: readonly Entry[]
    scheduledAt?: readonly number[]
    lastSelectable: number
    modelValue?: number
  }>(),
  { scheduledAt: () => [] },
)

const emit = defineEmits<{ 'update:modelValue': [day: number] }>()

const ENTRY_PLURALS: Record<EntryKind, [string, string]> = {
  dose: [brand.doseNoun, `${brand.doseNoun}s`],
  weight: ['weigh-in', 'weigh-ins'],
  symptom: ['side effect', 'side effects'],
  glucose: ['blood sugar reading', 'blood sugar readings'],
  vital: ['vital', 'vitals'],
  photo: ['photo', 'photos'],
}

const now = useNow()
const today = computed(() => atLocalTime(now.value, 0, 0, 0))
const localSelected = ref(today.value)

const selected = computed({
  get: () => props.modelValue ?? localSelected.value,
  set: (value: number) => {
    localSelected.value = value
    emit('update:modelValue', value)
  },
})

const initial = monthYearOf(selected.value)
const shownMonth = ref(initial.month)
const shownYear = ref(initial.year)
const viewMode = ref<'month' | 'months' | 'year'>('month')

const dayStart = (at: number) => atLocalTime(at, 0, 0, 0)
const loggedMarks = computed(() => markDays(props.entries, dayStart))
const marks = computed(() => withScheduled(loggedMarks.value, props.scheduledAt, dayStart))

function markForIso(isoDate: string): DayMark | undefined {
  const day = dayOfIsoDate(isoDate)
  return Number.isNaN(day) ? undefined : marks.value.get(day)
}

function hasEvent(isoDate: string): string | false {
  const mark = markForIso(isoDate)
  if (!mark) return false
  if (hasLoggedEntries(mark)) return 'primary'
  if (mark.scheduled) return 'secondary'
  return false
}

function dayAriaLabel(dayProps: Record<string, unknown>, isoDate: string): string {
  const base = typeof dayProps['aria-label'] === 'string' ? dayProps['aria-label'] : isoDate
  const mark = markForIso(isoDate)
  if (!mark) return base
  const text = dayMarkText(mark, ENTRY_PLURALS)
  return text ? `${base}, ${text}` : base
}

const selectedSummary = computed(() => {
  const dayLabel = formatDay(selected.value, now.value)
  const mark = marks.value.get(selected.value)
  const text = mark ? dayMarkText(mark, ENTRY_PLURALS) : ''
  return text ? `${dayLabel}: ${text}` : `${dayLabel}: nothing logged`
})

function onSelectDate(value: unknown) {
  if (value instanceof Date) {
    selected.value = dayOfDate(value)
  } else if (typeof value === 'string') {
    const day = dayOfIsoDate(value)
    if (!Number.isNaN(day)) selected.value = day
  }
}

function goToday() {
  const t = today.value
  const ym = monthYearOf(t)
  viewMode.value = 'month'
  shownMonth.value = ym.month
  shownYear.value = ym.year
  selected.value = t
}

function isNavDisabled(disabled: boolean | string[], key: string): boolean {
  return Array.isArray(disabled) ? disabled.includes(key) : Boolean(disabled)
}
</script>

<template>
  <v-card class="entries-calendar">
    <v-date-picker
      v-model:view-mode="viewMode"
      :model-value="dateOfDay(selected)"
      :month="shownMonth"
      :year="shownYear"
      :events="hasEvent"
      :first-day-of-week="calendarFirstDayOfWeek()"
      :max="dateOfDay(lastSelectable)"
      color="primary"
      width="100%"
      show-adjacent-months
      weeks-in-month="dynamic"
      hide-header
      control-variant="modal"
      @update:model-value="onSelectDate"
      @update:month="shownMonth = Number($event)"
      @update:year="shownYear = Number($event)"
    >
      <template #controls="{ disabled, prevMonth, nextMonth, openMonths }">
        <div class="cal-controls">
          <v-btn
            variant="text"
            density="comfortable"
            class="cal-controls__title pc-display"
            aria-label="Select month"
            @click="openMonths"
          >
            {{ formatMonth(monthStartOf(shownYear, shownMonth)) }}
          </v-btn>
          <div class="cal-controls__nav">
            <v-btn
              variant="text"
              density="comfortable"
              :icon="mdiChevronLeft"
              aria-label="Previous month"
              :disabled="isNavDisabled(disabled, 'prev-month')"
              @click="prevMonth"
            />
            <v-btn variant="text" density="comfortable" @click="goToday">Today</v-btn>
            <v-btn
              variant="text"
              density="comfortable"
              :icon="mdiChevronRight"
              aria-label="Next month"
              :disabled="isNavDisabled(disabled, 'next-month')"
              @click="nextMonth"
            />
          </div>
        </div>
      </template>

      <template #day="{ props: dayProps, item }">
        <v-btn v-bind="dayProps" :aria-label="dayAriaLabel(dayProps, item.isoDate)">
          <span class="cal-day">
            <span class="cal-day__num pc-num">{{ item.localized }}</span>
            <span v-if="markForIso(item.isoDate)" class="cal-marks" aria-hidden="true">
              <span
                v-if="hasLoggedEntries(markForIso(item.isoDate)!)"
                class="cal-mark cal-mark--logged"
              />
              <span
                v-if="markForIso(item.isoDate)!.scheduled"
                class="cal-mark cal-mark--scheduled"
              />
            </span>
          </span>
        </v-btn>
      </template>
    </v-date-picker>

    <div class="cal-legend text-body-small pc-muted">
      <span class="cal-legend__item">
        <span class="cal-mark cal-mark--logged" aria-hidden="true" />
        Logged
      </span>
      <span class="cal-legend__item">
        <span class="cal-mark cal-mark--scheduled" aria-hidden="true" />
        Scheduled
      </span>
    </div>

    <p class="d-sr-only" aria-live="polite">
      {{ selectedSummary }}
    </p>
  </v-card>
</template>

<style scoped>
.cal-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.cal-controls__title {
  font-size: 1rem;
  font-weight: 600;
  padding-inline: 8px;
}

.cal-controls__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cal-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
  gap: 3px;
}

.cal-marks {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 6px;
}

.cal-mark {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.cal-mark--logged {
  background: var(--pc-brand);
}

.cal-mark--scheduled {
  border: 1.5px solid var(--pc-accent);
  background: transparent;
}

:deep(.v-date-picker-month__day--selected) .cal-mark--logged {
  background: currentColor;
}

:deep(.v-date-picker-month__day--selected) .cal-mark--scheduled {
  border-color: currentColor;
}

.cal-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 16px 14px;
}

.cal-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
