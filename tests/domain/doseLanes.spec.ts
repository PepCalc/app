import { describe, expect, it } from 'vitest'
import { doseLanes, lanesAt, type LaneInput } from '@/domain/doseLanes'

const DAY = 86_400_000
const window = { start: 10 * DAY, end: 40 * DAY }
const lane = (key: string, doses: [number, number][]): LaneInput => ({
  key,
  label: key,
  unitLabel: 'mg',
  doses: doses.map(([day, amount]) => ({ at: day * DAY, amount })),
})

describe('doseLanes', () => {
  it('keeps the doses in view and labels the first and each change of strength', () => {
    const [row] = doseLanes(
      [
        lane('reta', [
          [5, 2],
          [12, 2],
          [19, 2],
          [26, 4],
          [33, 4],
        ]),
      ],
      window,
    )
    expect(row!.marks.map((m) => m.at / DAY)).toEqual([12, 19, 26, 33])
    expect(row!.marks.map((m) => m.changed)).toEqual([true, false, true, false])
    expect(row!.marks.map((m) => m.first)).toEqual([true, false, false, false])
  })

  it('drops a peptide with no dose in view', () => {
    expect(doseLanes([lane('old', [[2, 1]]), lane('new', [[20, 1]])], window)).toHaveLength(1)
  })
})

describe('lanesAt', () => {
  it('gives each row’s doses near a moment', () => {
    const rows = doseLanes([lane('a', [[20, 1]]), lane('b', [[30, 5]])], window)
    expect(lanesAt(rows, 20 * DAY + 3_600_000, DAY / 2)).toEqual([
      { key: 'a', label: 'a', unitLabel: 'mg', amounts: [1] },
    ])
  })
})
