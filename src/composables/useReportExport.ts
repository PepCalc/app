import { reactive } from 'vue'
import { useShelfStore } from '@/stores/shelf'
import { useJournalStore } from '@/stores/journal'
import { useSettingsStore } from '@/stores/settings'
import { useNotifyStore } from '@/stores/notify'
import type { ReportPeriod } from '@/domain/report'
import {
  availableSections,
  collectReport,
  type ReportSource,
} from '@/services/report/collectReport'
import type { ReportSection } from '@/services/report/reportData'
import { saveFile } from '@/services/fileTransfer'
import { fileDate, systemClock } from '@/services/time'

/**
 * Export the PDF report for a period and the sections the reader chose. The PDF writer loads
 * only when the user first exports (it is precached like every chunk, so this works offline),
 * the file is built on the device, and it leaves only through the share sheet or a download the
 * user starts.
 */
export function useReportExport() {
  const shelf = useShelfStore()
  const journal = useJournalStore()
  const settings = useSettingsStore()
  const notify = useNotifyStore()
  const state = reactive({ busy: false })

  function sourceFor(period: ReportPeriod, now: number): Omit<ReportSource, 'sections'> {
    return {
      vials: shelf.vials,
      draws: shelf.draws,
      groups: shelf.levelGroups,
      vialName: shelf.displayName,
      weights: journal.weights,
      symptoms: journal.symptoms,
      glucose: journal.glucose,
      vitals: journal.vitals,
      units: { weight: settings.weightUnit, a1c: settings.a1cUnit, glucose: settings.glucoseUnit },
      profile: settings.profile,
      period,
      now,
      locale: navigator.language,
    }
  }

  /** The sections with anything to print for `period`. */
  function available(period: ReportPeriod, now: number): Set<ReportSection> {
    return availableSections(sourceFor(period, now))
  }

  async function exportReport(
    period: ReportPeriod,
    sections: readonly ReportSection[],
  ): Promise<boolean> {
    state.busy = true
    try {
      const now = systemClock().getTime()
      const data = collectReport({ ...sourceFor(period, now), sections })
      const { renderReport } = await import('@/services/report/renderReport')
      const pdf = new Blob([renderReport(data)], { type: 'application/pdf' })
      const result = await saveFile(`pepcalc-report-${fileDate(now)}.pdf`, pdf)
      if (result === 'downloaded') notify.show('Report saved to your downloads.', 'success')
      return result !== 'cancelled'
    } catch {
      notify.show('Could not make the report on this device.', 'error')
      return false
    } finally {
      state.busy = false
    }
  }

  return { state, actions: { exportReport, available } }
}
