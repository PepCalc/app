import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { ProtocolRow } from '@/db/database'
import { reminderPlanFor } from '@/domain/reminderDays'
import {
  capReminders,
  groupByMinute,
  MAX_PENDING,
  planAtTimes,
  planReminders,
  reminderText,
  type PlannedReminder,
  type Reminder,
} from '@/domain/reminders'
import type { ScheduledReminder } from '@/services/reminders/nativeReminders'
import { atLocalTime, localCalendar, systemClock } from '@/services/time'
import { useProtocolsStore } from '@/stores/protocols'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'

/** Whether this build can schedule dose reminders: only the native app can wake itself. */
export const remindersSupported = __NATIVE__

export const REMINDER_HORIZON_DAYS = 7

/** Plans, groups and caps notifications for all active protocols with a vial. */
export function buildProtocolReminderPlan(input: {
  protocols: readonly ProtocolRow[]
  hasVial: (protocol: ProtocolRow) => boolean
  nameFor: (protocol: ProtocolRow) => string
  nextDueOf: (protocol: ProtocolRow, now: number) => number | null
  reminderFor: (subjectId: string) => Reminder
  showNames: boolean
  now: number
}): { reminders: ScheduledReminder[]; capped: boolean } {
  const { protocols, hasVial, nameFor, nextDueOf, reminderFor, showNames, now } = input
  const names = new Map<string, string>()
  const preciseIds = new Set<string>()
  const planned: PlannedReminder[] = []

  for (const p of protocols) {
    if (!hasVial(p)) continue
    const rule = reminderFor(p.id)
    if (!rule.enabled) continue
    names.set(p.id, nameFor(p))
    const plan = reminderPlanFor({
      schedule: p.schedule,
      dueAt: nextDueOf(p, now),
      now,
      horizonDays: REMINDER_HORIZON_DAYS,
      cal: localCalendar,
    })
    if (plan.mode === 'times') {
      preciseIds.add(p.id)
      planned.push(
        ...planAtTimes({
          subjectId: p.id,
          times: plan.times,
          rule,
          now,
          max: MAX_PENDING,
        }),
      )
    } else if (plan.mode === 'days') {
      planned.push(
        ...planReminders({
          subjectId: p.id,
          days: plan.days,
          repeating: plan.repeating,
          rule,
          now,
          atLocalTime,
        }),
      )
    }
  }

  const grouped = groupByMinute(planned)
  const capped = grouped.length > MAX_PENDING
  const reminders = capReminders(grouped, MAX_PENDING).map((g) => ({
    ...g,
    ...reminderText(
      g.kind,
      showNames ? g.subjectIds.map((id) => names.get(id) ?? '').filter(Boolean) : null,
      {
        count: g.subjectIds.length,
        precise: g.subjectIds.length === 1 && preciseIds.has(g.subjectIds[0]!),
      },
    ),
  }))
  return { reminders, capped }
}

/**
 * Keeps the device's scheduled dose reminders in step with protocols and draws. Mount once, in
 * App: every write reloads the stores, so logging, editing or deleting a draw, vial, protocol,
 * restore or reminder setting change all re-plan. Returning to the app re-plans too, rolling
 * the 7-day horizon forward. Does nothing on the web.
 */
export function useReminderSync() {
  if (!__NATIVE__) return
  const protocols = useProtocolsStore()
  const shelf = useShelfStore()
  const settings = useSettingsStore()

  function plan() {
    return buildProtocolReminderPlan({
      protocols: protocols.protocols,
      hasVial: protocols.hasVial,
      nameFor: protocols.nameFor,
      nextDueOf: protocols.nextDueOf,
      reminderFor: settings.reminderFor,
      showNames: settings.reminders.showNames,
      now: systemClock().getTime(),
    }).reminders
  }

  // Serialised so a burst of writes cannot interleave cancel and schedule calls.
  let queue = Promise.resolve()
  function sync() {
    if (!protocols.loaded || !shelf.loaded || !settings.loaded) return
    const reminders = plan()
    queue = queue
      .then(async () => {
        const { scheduleReminders } = await import('@/services/reminders/nativeReminders')
        await scheduleReminders(reminders)
      })
      .catch(() => {
        // A failed schedule leaves the previous set; the next change or launch tries again.
      })
  }

  watch(
    () => [
      protocols.protocols,
      shelf.vials,
      shelf.draws,
      settings.reminders,
      protocols.loaded,
      shelf.loaded,
      settings.loaded,
    ],
    sync,
    { immediate: true },
  )

  function onVisible() {
    if (document.visibilityState === 'visible') sync()
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisible))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
}
