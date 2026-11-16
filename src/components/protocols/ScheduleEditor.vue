<script setup lang="ts">
import { computed, reactive, useId, watch } from 'vue'
import {
  isValidCalendarDate,
  isValidSchedule,
  type Schedule,
  type Weekday,
} from '@/domain/schedule'
import { fromTimeValue, toTimeValue, type TimeOfDay } from '@/domain/timeOfDay'
import { fileDate, firstDayOfWeek, systemClock, weekdayName } from '@/services/time'
import { mdiDeleteOutline, mdiPlus } from '@/plugins/icons'

const KINDS = [
  { title: 'Every N hours', value: 'interval' },
  { title: 'Daily', value: 'daily' },
  { title: 'Chosen days', value: 'weekly' },
  { title: 'Days on, days off', value: 'cycle' },
  { title: 'As needed', value: 'asNeeded' },
] as const

const FALLBACK_TIMES = ['20:00', '12:00', '08:00', '16:00', '06:00', '22:00']

const model = defineModel<Schedule>({ required: true })
const emit = defineEmits<{ valid: [ok: boolean] }>()

const daysLabelId = useId()

const state = reactive<{
  kind: Schedule['kind']
  every: string
  unit: 'hours' | 'days'
  times: string[]
  days: Weekday[]
  onDays: string
  offDays: string
  anchor: string
}>({
  kind: 'interval',
  every: '1',
  unit: 'days',
  times: ['08:00'],
  days: [],
  onDays: '5',
  offDays: '2',
  anchor: fileDate(systemClock().getTime()),
})

let lastEmitted = ''

function syncFromModel(s: Schedule) {
  state.kind = s.kind
  switch (s.kind) {
    case 'interval': {
      const inDays = s.everyHours >= 24 && s.everyHours % 24 === 0
      state.unit = inDays ? 'days' : 'hours'
      state.every = String(inDays ? s.everyHours / 24 : s.everyHours)
      break
    }
    case 'daily':
      state.times = s.times.map(toTimeValue)
      break
    case 'weekly':
      state.days = [...s.days]
      state.times = s.times.map(toTimeValue)
      break
    case 'cycle':
      state.onDays = String(s.onDays)
      state.offDays = String(s.offDays)
      state.anchor = s.anchor
      state.times = s.times.map(toTimeValue)
      break
    case 'asNeeded':
      break
  }
}

watch(
  model,
  (next) => {
    if (JSON.stringify(next) === lastEmitted) return
    syncFromModel(next)
  },
  { immediate: true, deep: true },
)

const orderedWeekdays = computed<Weekday[]>(() => {
  const start = firstDayOfWeek()
  return Array.from({ length: 7 }, (_, i) => (((start - 1 + i) % 7) + 1) as Weekday)
})

const parsedTimes = computed<{ times: TimeOfDay[] | null; error?: string }>(() => {
  const parsed: TimeOfDay[] = []
  const seen = new Set<number>()
  for (const raw of state.times) {
    const t = fromTimeValue(raw)
    if (!t) return { times: null, error: 'Enter a valid time' }
    const mins = t.hour * 60 + t.minute
    if (seen.has(mins)) return { times: null, error: 'Each time must be different' }
    seen.add(mins)
    parsed.push(t)
  }
  if (!parsed.length || parsed.length > 6) return { times: null, error: 'Add 1 to 6 times' }
  parsed.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  return { times: parsed }
})

const everyHours = computed(() => {
  const n = Number.parseFloat(state.every)
  if (!Number.isFinite(n) || n <= 0) return null
  return state.unit === 'days' ? n * 24 : n
})

const everyError = computed(() => {
  if (state.kind !== 'interval') return undefined
  if (everyHours.value === null) return 'Enter a number greater than 0'
  if (everyHours.value > 8760) return 'At most 365 days (8760 hours)'
  return undefined
})

const onDaysVal = computed(() => Number(state.onDays))
const offDaysVal = computed(() => Number(state.offDays))
const cycleError = computed(() => {
  if (state.kind !== 'cycle') return undefined
  if (!Number.isInteger(onDaysVal.value) || onDaysVal.value < 1 || onDaysVal.value > 365) {
    return 'Enter 1 to 365 days on'
  }
  if (!Number.isInteger(offDaysVal.value) || offDaysVal.value < 1 || offDaysVal.value > 365) {
    return 'Enter 1 to 365 days off'
  }
  if (onDaysVal.value + offDaysVal.value > 366) return 'Total cycle can be at most 366 days'
  return undefined
})

const anchorError = computed(() => {
  if (state.kind !== 'cycle') return undefined
  return isValidCalendarDate(state.anchor) ? undefined : 'Enter a valid date'
})

const built = computed<Schedule | null>(() => {
  switch (state.kind) {
    case 'interval':
      return everyHours.value !== null ? { kind: 'interval', everyHours: everyHours.value } : null
    case 'daily':
      return parsedTimes.value.times ? { kind: 'daily', times: parsedTimes.value.times } : null
    case 'weekly':
      return parsedTimes.value.times
        ? {
            kind: 'weekly',
            days: [...state.days].sort((a, b) => a - b),
            times: parsedTimes.value.times,
          }
        : null
    case 'cycle':
      return parsedTimes.value.times
        ? {
            kind: 'cycle',
            onDays: onDaysVal.value,
            offDays: offDaysVal.value,
            times: parsedTimes.value.times,
            anchor: state.anchor,
          }
        : null
    case 'asNeeded':
      return { kind: 'asNeeded' }
  }
  return null
})

const isValid = computed(() => built.value !== null && isValidSchedule(built.value))

watch(
  [built, isValid],
  ([next, ok]) => {
    emit('valid', ok)
    if (ok && next) {
      lastEmitted = JSON.stringify(next)
      model.value = next
    }
  },
  { immediate: true },
)

function toggleDay(day: Weekday) {
  const idx = state.days.indexOf(day)
  if (idx >= 0) state.days.splice(idx, 1)
  else state.days.push(day)
}

function setTime(index: number, value: string) {
  state.times[index] = value
}

function removeTime(index: number) {
  if (state.times.length <= 1) return
  state.times.splice(index, 1)
}

function addTime() {
  if (state.times.length >= 6) return
  const candidate = FALLBACK_TIMES.find((t) => !state.times.includes(t))
  if (candidate) {
    state.times.push(candidate)
    return
  }
  for (let h = 0; h < 24; h++) {
    const val = toTimeValue({ hour: h, minute: 0 })
    if (!state.times.includes(val)) {
      state.times.push(val)
      return
    }
  }
}

const showTimes = computed(
  () => state.kind === 'daily' || state.kind === 'weekly' || state.kind === 'cycle',
)
</script>

<template>
  <div class="pc-stack">
    <v-select
      v-model="state.kind"
      label="How often"
      :items="KINDS"
      item-title="title"
      item-value="value"
    />

    <div v-if="state.kind === 'interval'" class="d-flex ga-3 align-start">
      <v-text-field
        v-model="state.every"
        label="Every"
        type="number"
        inputmode="decimal"
        :error-messages="everyError"
      />
      <v-select
        v-model="state.unit"
        label="Unit"
        :items="['hours', 'days']"
        class="schedule-editor__unit"
      />
    </div>

    <div v-if="state.kind === 'weekly'" class="pc-stack pc-stack--tight">
      <p :id="daysLabelId" class="pc-label">Days</p>
      <div role="group" :aria-labelledby="daysLabelId" class="schedule-editor__days">
        <v-btn
          v-for="d in orderedWeekdays"
          :key="d"
          :variant="state.days.includes(d) ? 'flat' : 'outlined'"
          :color="state.days.includes(d) ? 'primary' : undefined"
          :aria-pressed="state.days.includes(d)"
          :aria-label="weekdayName(d, 'long')"
          class="schedule-editor__day"
          @click="toggleDay(d)"
        >
          {{ weekdayName(d, 'narrow') }}
        </v-btn>
      </div>
      <p v-if="!state.days.length" class="text-body-small text-error">Choose at least one day.</p>
    </div>

    <template v-if="state.kind === 'cycle'">
      <div class="d-flex ga-3 align-start">
        <v-text-field
          v-model="state.onDays"
          label="Days on"
          type="number"
          inputmode="numeric"
          :error-messages="cycleError"
        />
        <v-text-field v-model="state.offDays" label="Days off" type="number" inputmode="numeric" />
      </div>
      <v-text-field
        v-model="state.anchor"
        label="Starts"
        type="date"
        :error-messages="anchorError"
      />
    </template>

    <div v-if="showTimes" class="pc-stack pc-stack--tight">
      <p class="pc-label">Times</p>
      <div v-for="(timeVal, index) in state.times" :key="index" class="d-flex align-center ga-2">
        <v-text-field
          :model-value="timeVal"
          type="time"
          :aria-label="`Time ${index + 1}`"
          class="schedule-editor__time"
          @update:model-value="setTime(index, String($event ?? ''))"
        />
        <v-btn
          v-if="state.times.length > 1"
          :icon="mdiDeleteOutline"
          variant="text"
          aria-label="Remove time"
          @click="removeTime(index)"
        />
      </div>
      <p v-if="parsedTimes.error" class="text-body-small text-error">{{ parsedTimes.error }}</p>
      <div v-if="state.times.length < 6">
        <v-btn variant="text" :prepend-icon="mdiPlus" @click="addTime">Add a time</v-btn>
      </div>
    </div>

    <p v-if="state.kind === 'asNeeded'" class="text-body-small pc-muted">
      No due time. Your last draw still shows.
    </p>
  </div>
</template>

<style scoped>
.schedule-editor__unit {
  flex: 0 0 132px;
}

.schedule-editor__days {
  display: flex;
  gap: 4px;
}

.schedule-editor__day {
  flex: 1 1 0;
  min-width: 36px;
  min-height: 44px;
  padding: 0 4px;
}

.schedule-editor__time {
  max-width: 180px;
}
</style>
