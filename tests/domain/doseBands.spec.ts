import { describe, expect, it } from 'vitest'
import {
  DOSE_SLOTS,
  doseBands,
  dosePeriodsOverlap,
  LABEL_ALL_MAX,
  labelledShots,
  shotsNear,
  type BandDose,
  type DoseBand,
} from '@/domain/doseBands'
import { valueAt } from '@/domain/photos'

const DAY = 86_400_000
const HOUR = 3_600_000
const t = (day: number) => day * DAY

const dose = (
  day: number,
  amount: number,
  key = 'sema',
  label = 'Wegovy',
  unitLabel = 'mg',
): BandDose => ({
  key,
  label,
  at: t(day),
  amount,
  unitLabel,
})

const lineOf = (...days: [number, number][]) => days.map(([day, value]) => ({ at: t(day), value }))

describe('doseBands', () => {
  it('1. returns empty bands, shots and legend when there are no doses', () => {
    expect(doseBands([], lineOf([0, 100], [7, 99]))).toEqual({
      bands: [],
      shots: [],
      legend: [],
      named: false,
    })
  })

  it('2. draws one band across four weekly doses at the same strength', () => {
    const line = lineOf([0, 100], [10, 99], [20, 98], [28, 97])
    const doses = [dose(0, 2.5), dose(7, 2.5), dose(14, 2.5), dose(21, 2.5)]
    const result = doseBands(doses, line)
    const bands: DoseBand[] = result.bands
    expect(bands).toHaveLength(1)
    expect(bands[0]).toMatchObject({ start: t(0), end: t(28), slot: 0, amount: 2.5 })
    expect(result.legend).toHaveLength(1)
    expect(result.shots.map((s) => s.changed)).toEqual([true, false, false, false])
    expect(result.named).toBe(false)
  })

  it('3. creates three bands across 2.5, 2.5, 5, 5, 7.5 with changed on shots 1, 3 and 5', () => {
    const line = lineOf([0, 100], [35, 95])
    const doses = [dose(0, 2.5), dose(7, 2.5), dose(14, 5), dose(21, 5), dose(28, 7.5)]
    const result = doseBands(doses, line)
    expect(result.bands.map((b) => [b.amount, b.slot, b.start, b.end])).toEqual([
      [2.5, 0, t(0), t(14)],
      [5, 1, t(14), t(28)],
      [7.5, 2, t(28), t(35)],
    ])
    expect(result.shots.map((s) => s.changed)).toEqual([true, false, true, false, true])
  })

  it('4. reuses the original slot when a strength returns later', () => {
    const line = lineOf([0, 100], [28, 96])
    const doses = [dose(0, 5), dose(7, 7.5), dose(14, 5)]
    const result = doseBands(doses, line)
    expect(result.bands.map((b) => [b.amount, b.slot])).toEqual([
      [5, 0],
      [7.5, 1],
      [5, 0],
    ])
    expect(result.legend).toHaveLength(2)
    expect(result.legend.map((l) => [l.amount, l.slot])).toEqual([
      [5, 0],
      [7.5, 1],
    ])
  })

  it('5. clips a band that started before the first weigh-in and omits its shot', () => {
    const line = lineOf([7, 100], [21, 98])
    const doses = [dose(0, 2.5), dose(14, 2.5)]
    const result = doseBands(doses, line)
    expect(result.bands).toHaveLength(1)
    expect(result.bands[0]).toMatchObject({ start: t(7), end: t(21), amount: 2.5 })
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]).toMatchObject({ at: t(14), changed: true, first: true })
  })

  it('6. drops a dose ten days after the last weigh-in and ends the prior band at the last point', () => {
    const line = lineOf([0, 100], [14, 98])
    const doses = [dose(0, 2.5), dose(24, 5)]
    const result = doseBands(doses, line)
    expect(result.bands).toHaveLength(1)
    expect(result.bands[0]).toMatchObject({ start: t(0), end: t(14), amount: 2.5 })
    expect(result.shots).toHaveLength(1)
    expect(result.legend).toHaveLength(1)
  })

  it('7. leaves weigh-ins before any dose uncovered', () => {
    const line = lineOf([0, 100], [7, 99], [21, 97])
    const doses = [dose(14, 2.5)]
    const result = doseBands(doses, line)
    expect(result.bands).toHaveLength(1)
    expect(result.bands[0]).toMatchObject({ start: t(14), end: t(21) })
  })

  it('8. marks named true and first on each medicine when two appear in sequence', () => {
    const line = lineOf([0, 100], [28, 95])
    const doses = [
      dose(0, 0.5, 'sema', 'Wegovy'),
      dose(7, 1, 'sema', 'Wegovy'),
      dose(14, 2.5, 'tirz', 'Zepbound'),
      dose(21, 5, 'tirz', 'Zepbound'),
    ]
    const result = doseBands(doses, line)
    expect(result.named).toBe(true)
    expect(result.shots.map((s) => s.first)).toEqual([true, false, true, false])
    expect(result.shots.map((s) => s.changed)).toEqual([true, true, true, true])
  })

  it('9. gives the same amount of two different medicines separate bands and slots', () => {
    const line = lineOf([0, 100], [21, 96])
    const doses = [dose(0, 5, 'sema', 'Wegovy'), dose(7, 5, 'tirz', 'Zepbound')]
    const result = doseBands(doses, line)
    expect(result.bands).toHaveLength(2)
    expect(result.bands.map((b) => b.slot)).toEqual([0, 1])
    expect(result.legend).toHaveLength(2)
  })

  it('10. wraps slot indices modulo DOSE_SLOTS on the ninth distinct strength', () => {
    const line = lineOf([0, 100], [70, 85])
    const doses = Array.from({ length: DOSE_SLOTS + 1 }, (_, i) => dose(i * 7, i + 1))
    const result = doseBands(doses, line)
    expect(result.bands).toHaveLength(DOSE_SLOTS + 1)
    expect(result.bands[DOSE_SLOTS]!.slot).toBe(0)
  })

  it('11. places a shot at the interpolated line height between two weigh-ins', () => {
    const line = lineOf([0, 100], [10, 90])
    const result = doseBands([dose(3, 2.5)], line)
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]!.value).toBe(valueAt(line, t(3)))
    expect(result.shots[0]!.value).toBeCloseTo(97)
  })

  it('12. produces the same result regardless of input dose order', () => {
    const line = lineOf([0, 100], [28, 95])
    const ordered = [dose(0, 2.5), dose(7, 2.5), dose(14, 5), dose(21, 7.5)]
    const shuffled = [ordered[2]!, ordered[0]!, ordered[3]!, ordered[1]!]
    expect(doseBands(shuffled, line)).toEqual(doseBands(ordered, line))
  })
})

describe('labelledShots', () => {
  const line = lineOf([0, 100], [250, 80])
  const thirty = Array.from({ length: 30 }, (_, i) => dose(i * 7, i < 15 ? 2.5 : 5))
  const { shots } = doseBands(thirty, line)

  it('13. labels only changed shots when more than LABEL_ALL_MAX shots are in view', () => {
    const labels = labelledShots(shots, { start: t(0), end: t(250) })
    expect(LABEL_ALL_MAX).toBe(12)
    expect([...labels]).toEqual([0, 15])
  })

  it('14. labels every shot when twelve or fewer fall in the window', () => {
    const labels = labelledShots(shots, { start: t(0), end: t(11 * 7) })
    expect(labels.size).toBe(12)
    expect([...labels]).toEqual(Array.from({ length: 12 }, (_, i) => i))
  })

  it('15. returns an empty set when the window holds no shot', () => {
    const labels = labelledShots(shots, { start: t(300), end: t(350) })
    expect(labels.size).toBe(0)
  })
})

describe('shotsNear', () => {
  it('16. finds a shot at its own time and returns nothing 13 hours away', () => {
    const line = lineOf([0, 100], [14, 98])
    const { shots } = doseBands([dose(7, 5)], line)
    expect(shotsNear(shots, t(7), 12 * HOUR)).toHaveLength(1)
    expect(shotsNear(shots, t(7) + 13 * HOUR, 12 * HOUR)).toEqual([])
  })
})

describe('dosePeriodsOverlap', () => {
  it('17. returns false for one medicine or two in sequence, and true when interleaved', () => {
    expect(dosePeriodsOverlap([dose(0, 2.5, 'a'), dose(14, 5, 'a')])).toBe(false)
    expect(
      dosePeriodsOverlap([
        dose(0, 2.5, 'a'),
        dose(14, 2.5, 'a'),
        dose(15, 2.5, 'b'),
        dose(28, 5, 'b'),
      ]),
    ).toBe(false)
    expect(
      dosePeriodsOverlap([
        dose(0, 2.5, 'a'),
        dose(21, 2.5, 'a'),
        dose(14, 2.5, 'b'),
        dose(35, 5, 'b'),
      ]),
    ).toBe(true)
  })
})
