<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { CalendarSpec } from '@/domain/calendar'
import { toTimeValue } from '@/domain/reminders'
import { remindersSupported } from '@/composables/useReminderSync'
import { formatDate, formatDateTime, formatWeekday } from '@/services/time'
import { nativeApps } from '@/services/platform'
import { useSettingsStore } from '@/stores/settings'
import {
  mdiBellRingOutline,
  mdiCalendarPlus,
  mdiCheckCircle,
  mdiChevronLeft,
  mdiChevronRight,
} from '@/plugins/icons'
import CalendarInviteForm from './CalendarInviteForm.vue'
import NotifyMePanel from './NotifyMePanel.vue'

/**
 * Add a reminder for one subject: a choice of "Notify me" (the native app's own notification)
 * or "Add calendar invite" (any calendar, which works everywhere), each opening in place with a
 * back arrow, as a settings screen pushes a page. The web build shows Notify me as unavailable
 * and says why, rather than hiding it.
 */
const props = withDefaults(
  defineProps<{
    subjectId: string
    name: string
    dueAt: number | null
    calendar: CalendarSpec
    mode?: 'times' | 'days'
    repeating?: boolean
    lastTakenAt?: string | null
    nextReminderAt?: number | null
    capped?: boolean
  }>(),
  {
    mode: 'days',
    repeating: false,
    lastTakenAt: null,
    nextReminderAt: null,
    capped: false,
  },
)
const open = defineModel<boolean>({ required: true })

const settings = useSettingsStore()
const titleId = useId()

type Step = 'choose' | 'notify' | 'calendar'
const step = ref<Step>('choose')

watch(open, (isOpen) => {
  if (isOpen) step.value = 'choose'
})

const TITLES: Record<Step, string> = {
  choose: 'Add reminder',
  notify: 'Notify me',
  calendar: 'Calendar invite',
}

const notifyOn = computed(
  () => remindersSupported && !!props.subjectId && settings.reminderFor(props.subjectId).enabled,
)

const nextDose = computed(() => {
  if (props.dueAt === null) return 'No dose logged yet'
  return props.mode === 'times'
    ? `Next dose ${formatDateTime(props.dueAt)}`
    : `Next dose ${formatWeekday(props.dueAt)}, ${formatDate(props.dueAt)}`
})

const notifySubtitle = computed(() => {
  if (!remindersSupported) return `Needs ${nativeApps}`
  if (!props.subjectId || !notifyOn.value) {
    return props.mode === 'times'
      ? 'A notification at your scheduled times'
      : 'A notification on the day your dose is due'
  }
  const r = settings.reminderFor(props.subjectId)
  if (props.mode === 'times') {
    return r.leadMinutes === 0 ? 'On at scheduled times' : `On ${r.leadMinutes} minutes before`
  }
  return `On at ${toTimeValue(r)}${r.dayBefore && !props.repeating ? ', and the day before' : ''}`
})
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable :aria-labelledby="titleId">
    <v-card v-if="subjectId" class="reminder">
      <v-card-item>
        <template v-if="step !== 'choose'" #prepend>
          <v-btn
            :icon="mdiChevronLeft"
            variant="text"
            aria-label="Back to reminder options"
            @click="step = 'choose'"
          />
        </template>
        <p class="pc-eyebrow">{{ name }}</p>
        <v-card-title :id="titleId">{{ TITLES[step] }}</v-card-title>
      </v-card-item>

      <v-card-text>
        <v-window v-model="step" :touch="false">
          <v-window-item value="choose">
            <div class="pc-stack">
              <p class="pc-muted">{{ nextDose }}</p>
              <ul class="options" aria-label="Ways to be reminded">
                <li>
                  <button
                    type="button"
                    class="option"
                    :disabled="!remindersSupported"
                    :aria-describedby="`${titleId}-notify`"
                    @click="step = 'notify'"
                  >
                    <span class="option__badge">
                      <v-icon :icon="mdiBellRingOutline" />
                    </span>
                    <span class="option__text">
                      <span class="option__title">Notify me</span>
                      <span :id="`${titleId}-notify`" class="option__subtitle">
                        {{ notifySubtitle }}
                      </span>
                    </span>
                    <v-icon
                      v-if="notifyOn"
                      :icon="mdiCheckCircle"
                      color="primary"
                      aria-label="On"
                    />
                    <v-icon v-else-if="remindersSupported" :icon="mdiChevronRight" />
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    class="option"
                    :aria-describedby="`${titleId}-calendar`"
                    @click="step = 'calendar'"
                  >
                    <span class="option__badge">
                      <v-icon :icon="mdiCalendarPlus" />
                    </span>
                    <span class="option__text">
                      <span class="option__title">Add calendar invite</span>
                      <span :id="`${titleId}-calendar`" class="option__subtitle">
                        Apple, Google, Outlook and other calendars
                      </span>
                    </span>
                    <v-icon :icon="mdiChevronRight" />
                  </button>
                </li>
              </ul>
              <p v-if="!remindersSupported" class="text-body-small pc-muted">
                Use your calendar for reminders.
              </p>
            </div>
          </v-window-item>

          <v-window-item value="notify">
            <NotifyMePanel
              v-if="step === 'notify'"
              :subject-id="subjectId"
              :mode="mode"
              :repeating="repeating"
              :has-due="dueAt !== null"
              :last-taken-at="lastTakenAt"
              :next-reminder-at="nextReminderAt"
              :capped="capped"
              @calendar="step = 'calendar'"
            />
          </v-window-item>

          <v-window-item value="calendar">
            <CalendarInviteForm
              v-if="step === 'calendar'"
              :subject-id="subjectId"
              :name="name"
              :calendar="calendar"
            />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 72px;
  padding: 12px 14px;
  border: 1px solid var(--pc-divider);
  border-radius: var(--pc-radius-lg);
  background: var(--pc-surface);
  color: var(--pc-text-1);
  text-align: start;
  font: inherit;
  cursor: pointer;
  transition:
    background-color var(--pc-dur-fast) var(--pc-ease-standard),
    border-color var(--pc-dur-fast) var(--pc-ease-standard);
}

.option:hover:not(:disabled) {
  background: var(--pc-surface-2);
  border-color: var(--pc-divider-strong);
}

.option:focus-visible {
  outline: none;
  box-shadow: var(--pc-shadow-focus);
}

.option:disabled {
  cursor: default;
  opacity: 0.6;
}

.option__badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--pc-radius-pill);
  color: var(--pc-brand-strong);
  background: var(--pc-brand-soft);
}

.option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option__title {
  font-weight: 600;
}

.option__subtitle {
  font-size: 0.875rem;
  color: var(--pc-text-2);
}
</style>
