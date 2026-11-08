import { onBeforeUnmount, onMounted, watch } from 'vue'
import { syncDue } from '@/domain/healthSync'
import { useHealthSyncStore } from '@/stores/healthSync'
import { useJournalStore } from '@/stores/journal'
import { systemClock, toEpochMs } from '@/services/time'

/** A new or edited reading goes out this long after the last change, once a burst settles. */
const AFTER_CHANGE_MS = 2000

/**
 * Keeps ongoing health sync running while the app is in use. Mount once, in App: it syncs on
 * launch and on return to the app when the last sync is older than the interval, and soon after
 * any change to the readings. It never asks for access; only a tap in Settings does. Does
 * nothing on the web or until the user turns ongoing sync on.
 */
export function useHealthAutoSync() {
  if (!__NATIVE__) return
  const journal = useJournalStore()
  const health = useHealthSyncStore()

  const active = () =>
    health.loaded &&
    journal.loaded &&
    health.settings.enabled &&
    health.settings.schedule === 'ongoing' &&
    !health.state.running

  function syncIfDue() {
    if (!active()) return
    const last = health.settings.lastSyncAt ? toEpochMs(health.settings.lastSyncAt) : null
    if (syncDue(last, systemClock().getTime())) void health.run(false)
  }

  watch(() => [health.loaded, journal.loaded], syncIfDue, { immediate: true })

  /*
   * Every write reloads the whole journal, so watch the ids of rows that can sync: a new dose
   * or side effect changes nothing here. The sync's own import changes them while it runs;
   * `active` ignores that.
   */
  const syncable = () =>
    [
      ...journal.weights.map((w) => w.id),
      ...journal.glucose.flatMap((g) => (g.kind === 'glucose' ? [g.id] : [])),
      ...journal.vitals.map((v) => v.id),
    ].join()
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(syncable, () => {
    if (!active()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (active()) void health.run(false)
    }, AFTER_CHANGE_MS)
  })

  function onVisible() {
    if (document.visibilityState === 'visible') syncIfDue()
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisible))
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(timer)
  })
}
