export type EntryKind = 'dose' | 'weight' | 'symptom' | 'glucose' | 'vital' | 'photo'

/** One logged thing as a list shows it. Text is already formatted in the user's units. */
export interface Entry {
  /** The row's id in its own table. Unique within a kind. */
  id: string
  kind: EntryKind
  /** Epoch milliseconds. */
  at: number
  /** The main line: "7.5 mg Zepbound", "82.4 kg", "Nausea". */
  title: string
  /** The second line, without the date: "Abdomen, left", "Fasting", "Mild". */
  detail: string
  notes: string
}
