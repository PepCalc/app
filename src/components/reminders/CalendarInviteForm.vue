<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  calendarTitle,
  googleCalendarUrl,
  icsFile,
  outlookCalendarUrl,
  type CalendarEvent,
  type CalendarSpec,
} from '@/domain/calendar'
import { fromTimeValue, toTimeValue } from '@/domain/reminders'
import { saveFile } from '@/services/fileTransfer'
import {
  atLocalTime,
  deviceTimeZone,
  fileDate,
  formatDateTime,
  localParts,
  nowIso,
  toEpochMs,
  toIso,
} from '@/services/time'
import { useNotifyStore } from '@/stores/notify'
import { useSettingsStore } from '@/stores/settings'
import { mdiDownload } from '@/plugins/icons'

/**
 * A subject's dose schedule as a repeating calendar event: a calendar file for any app, or
 * links that open Google Calendar or Outlook with it filled in. The calendar then reminds the
 * user, which the web app cannot do on its own.
 */
const props = defineProps<{
  subjectId: string
  name: string
  calendar: CalendarSpec
}>()

const settings = useSettingsStore()
const notify = useNotifyStore()

const time = ref('09:00')
const includeName = ref(false)

const EVENT_MINUTES = 15

// Start from the subject's reminder time, so a notification and an invite agree.
watch(
  () => props.subjectId,
  (id) => {
    time.value = toTimeValue(settings.reminderFor(id))
    includeName.value = settings.reminders.showNames
  },
  { immediate: true },
)

function buildEvent(
  startMs: number,
  index: number,
  spec: Extract<CalendarSpec, { kind: 'atChosenTime' | 'fixedTimes' }>,
): CalendarEvent {
  const endMs = startMs + EVENT_MINUTES * 60_000
  const suffix = spec.kind === 'fixedTimes' ? `-${index}` : ''
  return {
    uid: `${props.subjectId}-${fileDate(startMs)}${suffix}@pepcalc.com`,
    title: calendarTitle(includeName.value ? props.name : null),
    description: spec.description,
    start: localParts(startMs),
    end: localParts(endMs),
    startUtc: toIso(startMs),
    endUtc: toIso(endMs),
    timeZone: deviceTimeZone(),
    recurrence: spec.recurrence,
    createdUtc: nowIso(),
  }
}

const events = computed<CalendarEvent[]>(() => {
  const spec = props.calendar
  if (spec.kind === 'atChosenTime') {
    const at = fromTimeValue(time.value)
    if (!at) return []
    const startMs = atLocalTime(spec.startDayMs, 0, at.hour, at.minute)
    return [buildEvent(startMs, 0, spec)]
  }
  if (spec.kind === 'fixedTimes') {
    return spec.starts.map((s, i) => buildEvent(s.startMs, i, spec))
  }
  return []
})

const startText = computed(() => {
  const first = events.value[0]
  if (!first) return ''
  const spec = props.calendar
  if (spec.kind !== 'atChosenTime' && spec.kind !== 'fixedTimes') return ''
  return spec.recurrence.kind === 'dates' || spec.recurrence.kind === 'none'
    ? `Starts ${formatDateTime(first.startUtc)} (${spec.summary}).`
    : `Starts ${formatDateTime(first.startUtc)} and repeats ${spec.summary}.`
})

const linkRows = computed(() => {
  const spec = props.calendar
  if (spec.kind !== 'atChosenTime' && spec.kind !== 'fixedTimes') return []
  if (spec.recurrence.kind === 'dates' || spec.recurrence.kind === 'none') return []
  return events.value.map((e, i) => ({
    label: spec.kind === 'fixedTimes' && events.value.length > 1 ? spec.starts[i]!.timeLabel : null,
    google: googleCalendarUrl(e),
    outlook: outlookCalendarUrl(e, 'outlook.live.com'),
    office: outlookCalendarUrl(e, 'outlook.office.com'),
  }))
})

async function download() {
  const list = events.value
  if (!list.length) return
  const result = await saveFile(
    `pepcalc-dose-${fileDate(toEpochMs(list[0]!.startUtc))}.ics`,
    icsFile(list),
    'text/calendar',
  )
  if (result !== 'cancelled')
    notify.show('Calendar invite saved. Open it to add the event.', 'success')
}
</script>

<template>
  <div v-if="calendar.kind === 'needsDose'" class="pc-stack">
    <p>Log a first dose, then add its schedule to your calendar.</p>
  </div>
  <div v-else-if="calendar.kind === 'unsupported'" class="pc-stack">
    <p>{{ calendar.message }}</p>
  </div>
  <div v-else-if="events.length" class="pc-stack pc-stack--loose">
    <div class="pc-stack">
      <v-text-field
        v-if="calendar.kind === 'atChosenTime'"
        v-model="time"
        label="Time of day"
        type="time"
      />
      <v-switch v-model="includeName" label="Show the name" color="primary" hide-details />
      <p class="text-body-small pc-muted">{{ startText }}</p>
    </div>

    <div class="pc-stack pc-stack--tight">
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        block
        :prepend-icon="mdiDownload"
        @click="download"
      >
        Download calendar invite
      </v-btn>
      <p class="text-body-small pc-muted">
        Works with Apple, Samsung, Outlook and most calendar apps. Open it to add a repeating event
        with an alert.
      </p>
    </div>

    <div v-if="linkRows.length" class="pc-stack pc-stack--tight">
      <p class="pc-label">Or add it online</p>
      <div v-for="(row, idx) in linkRows" :key="idx" class="pc-stack pc-stack--tight">
        <p v-if="row.label" class="text-body-small pc-muted">{{ row.label }}</p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="outlined" :href="row.google" target="_blank" rel="noopener noreferrer">
            Google Calendar
          </v-btn>
          <v-btn variant="outlined" :href="row.outlook" target="_blank" rel="noopener noreferrer">
            Outlook.com
          </v-btn>
          <v-btn variant="outlined" :href="row.office" target="_blank" rel="noopener noreferrer">
            Microsoft 365
          </v-btn>
        </div>
      </div>
      <p class="text-body-small pc-muted">
        Sends the event to Google or Microsoft. In Outlook, set Repeat to
        {{ calendar.summary }} before saving.
      </p>
    </div>
  </div>
</template>
