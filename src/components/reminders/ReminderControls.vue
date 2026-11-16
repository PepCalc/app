<script setup lang="ts">
import { fromTimeValue, LEAD_MINUTES_OPTIONS, toTimeValue } from '@/domain/reminders'
import { formatDateTime } from '@/services/time'
import { useSettingsStore } from '@/stores/settings'

/** Reminder controls for one subject: its schedule-specific timing and when the next one comes. */
const props = withDefaults(
  defineProps<{
    subjectId: string
    mode?: 'times' | 'days'
    repeating?: boolean
    hasDue?: boolean
    nextReminderAt?: number | null
  }>(),
  { mode: 'days', repeating: false, hasDue: false, nextReminderAt: null },
)

const settings = useSettingsStore()

const LEAD_LABELS: Record<number, string> = {
  0: 'At the time',
  5: '5 minutes before',
  10: '10 minutes before',
  15: '15 minutes before',
  30: '30 minutes before',
  60: '1 hour before',
}

const leadItems = LEAD_MINUTES_OPTIONS.map((value) => ({
  title: LEAD_LABELS[value] ?? `${value} minutes before`,
  value,
}))

function setTime(value: string) {
  const time = fromTimeValue(value)
  if (time) void settings.setReminder(props.subjectId, time)
}

/** "Next reminder …", or why there is none yet. */
function nextReminderText(): string {
  if (!props.hasDue) return 'Reminders start after you log a first dose.'
  return props.nextReminderAt !== null
    ? `Next reminder ${formatDateTime(props.nextReminderAt)}`
    : 'No reminder until your next dose is logged.'
}
</script>

<template>
  <div class="pc-stack">
    <template v-if="mode === 'times'">
      <v-select
        :model-value="settings.reminderFor(subjectId).leadMinutes"
        :items="leadItems"
        label="Remind me"
        @update:model-value="settings.setReminder(subjectId, { leadMinutes: Number($event) })"
      />
    </template>
    <template v-else>
      <v-text-field
        :model-value="toTimeValue(settings.reminderFor(subjectId))"
        label="Time of day"
        type="time"
        @change="setTime(($event.target as HTMLInputElement).value)"
      />
      <v-switch
        v-if="!repeating"
        :model-value="settings.reminderFor(subjectId).dayBefore"
        label="Also remind me the day before"
        color="primary"
        hide-details
        @update:model-value="settings.setReminder(subjectId, { dayBefore: !!$event })"
      />
    </template>
    <p class="text-body-small pc-muted">{{ nextReminderText() }}</p>
  </div>
</template>
