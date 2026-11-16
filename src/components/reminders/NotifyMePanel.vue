<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { suggestReminderTime } from '@/domain/reminders'
import {
  checkNotificationAccess,
  openNotificationSettings,
  requestNotificationAccess,
  type NotificationAccess,
} from '@/services/reminders/notificationAccess'
import { localParts, toEpochMs } from '@/services/time'
import { nativeApps, notificationSettingsSteps, systemName } from '@/services/platform'
import { useNotifyStore } from '@/stores/notify'
import { useSettingsStore } from '@/stores/settings'
import {
  mdiBellOffOutline,
  mdiBellRingOutline,
  mdiGestureTap,
  mdiLockOutline,
} from '@/plugins/icons'
import ReminderControls from './ReminderControls.vue'

/**
 * "Notify me" for one subject, following the permission the way the platforms recommend:
 * explain first and ask only when the user chooses to; once allowed, turn the reminder on at
 * the time they usually dose; if notifications are blocked, say so and open the exact settings
 * screen, then check again when the user comes back.
 */
const props = withDefaults(
  defineProps<{
    subjectId: string
    mode?: 'times' | 'days'
    repeating?: boolean
    hasDue?: boolean
    lastTakenAt?: string | null
    nextReminderAt?: number | null
    capped?: boolean
  }>(),
  {
    mode: 'days',
    repeating: false,
    hasDue: false,
    lastTakenAt: null,
    nextReminderAt: null,
    capped: false,
  },
)
const emit = defineEmits<{ calendar: [] }>()

const settings = useSettingsStore()
const notify = useNotifyStore()

const access = ref<NotificationAccess | 'checking'>('checking')
const asking = ref(false)

/** Tapping Notify me means "turn it on", so it is on as soon as the system allows it. */
async function turnOn() {
  const id = props.subjectId
  const known = settings.reminders.subjects[id]
  const time =
    known ?? (props.lastTakenAt ? suggestReminderTime(...hourMinute(props.lastTakenAt)) : {})
  await settings.setReminder(id, { ...time, enabled: true })
}

function hourMinute(iso: string): [number, number] {
  const p = localParts(toEpochMs(iso))
  return [p.hour, p.minute]
}

let turnedOnHere = false
async function check() {
  access.value = await checkNotificationAccess()
  // Once per visit: if the user then turns it off here, coming back must not undo that.
  if (access.value === 'granted' && !turnedOnHere) {
    turnedOnHere = true
    if (!settings.reminderFor(props.subjectId).enabled) await turnOn()
  }
}

async function allow() {
  asking.value = true
  try {
    access.value = await requestNotificationAccess()
    if (access.value === 'granted') {
      turnedOnHere = true
      await turnOn()
    }
  } finally {
    asking.value = false
  }
}

async function openSettings() {
  if (!(await openNotificationSettings())) notify.show(notificationSettingsSteps, 'info')
}

async function setOff() {
  await settings.setReminder(props.subjectId, { enabled: false })
}

async function setOn() {
  await turnOn()
}

// Returning from the phone's settings shows the app again; that is when access may have changed.
function onVisible() {
  if (document.visibilityState === 'visible') void check()
}
onMounted(() => {
  void check()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <div class="notify" aria-live="polite">
    <div v-if="access === 'checking'" class="notify__centre">
      <v-progress-circular indeterminate color="primary" aria-label="Checking notifications" />
    </div>

    <div v-else-if="access === 'prompt'" class="pc-stack pc-stack--loose">
      <div class="notify__hero">
        <span class="notify__badge"><v-icon :icon="mdiBellRingOutline" size="32" /></span>
        <h3 class="text-title-large pc-display">Get a reminder when a dose is due</h3>
      </div>
      <ul class="notify__points">
        <li>
          <v-icon :icon="mdiBellRingOutline" size="20" />
          <span>{{
            mode === 'times'
              ? 'At your scheduled dose times, or just before.'
              : 'On the day your dose is due, at a time you choose.'
          }}</span>
        </li>
        <li>
          <v-icon :icon="mdiGestureTap" size="20" />
          <span>Tap it to go straight to logging the dose.</span>
        </li>
        <li>
          <v-icon :icon="mdiLockOutline" size="20" />
          <span>It just says "Dose due" unless you choose to show the name.</span>
        </li>
      </ul>
      <div class="pc-stack pc-stack--tight">
        <v-btn color="primary" variant="flat" size="large" block :loading="asking" @click="allow">
          Allow notifications
        </v-btn>
        <p class="text-body-small pc-muted text-center">
          Reminders are set on this phone. Nothing is sent anywhere.
        </p>
      </div>
    </div>

    <div v-else-if="access === 'denied'" class="pc-stack pc-stack--loose">
      <div class="notify__hero">
        <span class="notify__badge notify__badge--off">
          <v-icon :icon="mdiBellOffOutline" size="32" />
        </span>
        <h3 class="text-title-large pc-display">Notifications are off for PepCalc</h3>
        <p class="pc-muted">
          Turn on notifications for PepCalc in {{ systemName }} settings, then come back here.
        </p>
      </div>
      <div class="pc-stack pc-stack--tight">
        <v-btn color="primary" variant="flat" size="large" block @click="openSettings">
          Open settings
        </v-btn>
        <v-btn variant="text" block @click="emit('calendar')">
          Add a calendar invite instead
        </v-btn>
      </div>
    </div>

    <div v-else-if="access === 'granted'" class="pc-stack pc-stack--loose">
      <template v-if="settings.reminderFor(subjectId).enabled">
        <div class="notify__hero">
          <span class="notify__badge"><v-icon :icon="mdiBellRingOutline" size="32" /></span>
          <h3 class="text-title-large pc-display">Reminder on</h3>
        </div>
        <ReminderControls
          :subject-id="subjectId"
          :mode="mode"
          :repeating="repeating"
          :has-due="hasDue"
          :next-reminder-at="nextReminderAt"
        />
        <p v-if="capped" class="text-body-small pc-muted">
          Open PepCalc now and then to keep reminders coming.
        </p>
        <div>
          <v-btn variant="text" @click="setOff">Turn off reminder</v-btn>
        </div>
      </template>
      <template v-else>
        <div class="notify__hero">
          <span class="notify__badge notify__badge--off">
            <v-icon :icon="mdiBellOffOutline" size="32" />
          </span>
          <h3 class="text-title-large pc-display">Reminder off</h3>
        </div>
        <v-btn color="primary" variant="flat" size="large" block @click="setOn">
          Turn on reminder
        </v-btn>
      </template>
    </div>

    <p v-else class="pc-muted">
      Notifications need {{ nativeApps }}. Use a calendar invite instead.
    </p>
  </div>
</template>

<style scoped>
.notify__centre {
  display: grid;
  place-items: center;
  min-height: 160px;
}

.notify__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.notify__hero h3 {
  margin: 0;
}

.notify__badge {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: var(--pc-radius-pill);
  color: var(--pc-brand-strong);
  background: var(--pc-brand-soft);
}

.notify__badge--off {
  color: var(--pc-text-2);
  background: var(--pc-surface-sunk);
}

.notify__points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.notify__points li {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 12px;
  align-items: start;
  color: var(--pc-text-1);
}

.notify__points .v-icon {
  color: var(--pc-brand);
  margin-top: 2px;
}
</style>
