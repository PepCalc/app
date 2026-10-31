import { formatDate, formatDateTime } from '@/services/time'

/**
 * A label for each photo in a picker: its date, or its date and time when another photo shares
 * that date, so two photos taken on one day can still be told apart.
 */
export function photoLabels(
  photos: readonly { id: string; takenAt: string }[],
): Map<string, string> {
  const perDay = new Map<string, number>()
  for (const p of photos) {
    const day = formatDate(p.takenAt)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  return new Map(
    photos.map((p) => {
      const day = formatDate(p.takenAt)
      return [p.id, (perDay.get(day) ?? 0) > 1 ? formatDateTime(p.takenAt) : day]
    }),
  )
}
