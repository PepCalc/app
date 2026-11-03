/**
 * Logged doses as one row per peptide under a body measure, on the same time axis. Rows scale
 * where marks on the measure's line do not: three peptides taken daily would put hundreds of
 * marks on one line. Every dose gets a tick; only a change of strength gets a label, and the
 * first tick in view also names the peptide.
 */
import type { DoseEvent } from './pk'

export interface LaneInput {
  key: string
  label: string
  unitLabel: string
  /** Every dose in `unitLabel`, oldest first, including those before the window. */
  doses: DoseEvent[]
}

interface LaneMark extends DoseEvent {
  /** The first tick in view, or a different strength from the dose before it. */
  changed: boolean
  /** The first tick in view, which carries the peptide's name. */
  first: boolean
}

export interface DoseLane {
  key: string
  label: string
  unitLabel: string
  marks: LaneMark[]
}

/**
 * The rows for the doses inside `window`. A strength is compared with the dose before it even
 * when that dose falls before the window, so a label marks a real change; a peptide with no dose
 * in view has no row.
 */
export function doseLanes(
  inputs: readonly LaneInput[],
  window: { start: number; end: number },
): DoseLane[] {
  return inputs.flatMap((input) => {
    const marks: LaneMark[] = []
    let previous: number | undefined
    for (const dose of [...input.doses].sort((a, b) => a.at - b.at)) {
      const inView = dose.at >= window.start && dose.at <= window.end
      if (inView) {
        const first = marks.length === 0
        marks.push({ ...dose, first, changed: first || previous !== dose.amount })
      }
      previous = dose.amount
    }
    return marks.length
      ? [{ key: input.key, label: input.label, unitLabel: input.unitLabel, marks }]
      : []
  })
}

/** Each row's doses within `toleranceMs` of `at`, for a readout at one moment. */
export function lanesAt(
  lanes: readonly DoseLane[],
  at: number,
  toleranceMs: number,
): { key: string; label: string; unitLabel: string; amounts: number[] }[] {
  return lanes.flatMap((lane) => {
    const amounts = lane.marks
      .filter((m) => Math.abs(m.at - at) <= toleranceMs)
      .map((m) => m.amount)
    return amounts.length
      ? [{ key: lane.key, label: lane.label, unitLabel: lane.unitLabel, amounts }]
      : []
  })
}
