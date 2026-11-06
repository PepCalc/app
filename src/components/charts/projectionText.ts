import type { SteadyOutlook } from '@/domain/projection'
import { formatMonthDay } from '@/services/time'

const DAY_MS = 86_400_000

/** "5 days" under two weeks, then "4 weeks": finer than the model can claim would mislead. */
function durationText(ms: number): string {
  const days = Math.max(1, Math.round(ms / DAY_MS))
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`
  return `${Math.round(days / 7)} weeks`
}

/** The outlook as a label and value: "Steady by" and "Dec 4". */
export function outlookStat(
  outlook: SteadyOutlook,
  now: number,
): { label: string; value: string; detail?: string } {
  switch (outlook.kind) {
    case 'now':
      return { label: 'Levels', value: 'Steady now' }
    case 'immediate':
      return { label: 'Levels', value: 'No build-up' }
    case 'by':
      return {
        label: 'Steady by',
        value: formatMonthDay(outlook.at),
        detail: `about ${durationText(outlook.at - now)}`,
      }
    case 'cut-off':
      return {
        label: `By ${formatMonthDay(outlook.at)}`,
        value: outlook.rising ? 'Still rising' : 'Still falling',
      }
  }
}

/** The outlook in a few words, for the line on a card. */
export function outlookShort(outlook: SteadyOutlook): string {
  switch (outlook.kind) {
    case 'now':
    case 'immediate':
      return 'Steady'
    case 'by':
      return `Steady by ${formatMonthDay(outlook.at)}`
    case 'cut-off':
      return outlook.rising ? 'Still rising' : 'Still falling'
  }
}
