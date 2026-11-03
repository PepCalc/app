import { describe, expect, it } from 'vitest'
import {
  OVERLAY_MAX,
  assignSlots,
  overlayModel,
  overlayTable,
  overlayWindow,
  type OverlayInput,
} from '@/domain/overlay'

const H = 3_600_000
const DAY = 24 * H
const now = 100 * DAY

const weekly: OverlayInput = {
  key: 'sema',
  label: 'Semaglutide',
  params: { halfLifeHours: 168, tmaxHours: 56 },
  doses: [{ at: now - 3 * DAY, amount: 0.25 }],
  unitLabel: 'mg',
}
const daily: OverlayInput = {
  key: 'bpc',
  label: 'BPC-157',
  params: { halfLifeHours: 4, tmaxHours: 0.5 },
  doses: [{ at: now - 2 * H, amount: 250 }],
  unitLabel: 'mcg',
}

describe('overlayModel', () => {
  it('scales each curve to its own peak, whatever its unit or size', () => {
    const { series } = overlayModel([weekly, daily], now)
    for (const s of series) {
      const top = Math.max(...s.points.map((p) => p.percent))
      expect(top).toBeCloseTo(100, 6)
      expect(s.points.every((p) => p.percent >= 0 && p.percent <= 100 + 1e-9)).toBe(true)
    }
    expect(series[1]!.peakAmount).toBeGreaterThan(series[0]!.peakAmount)
  })

  it('keeps amounts alongside percentages, in each curve’s own unit', () => {
    const s = overlayModel([daily], now).series[0]!
    const peak = s.points.find((p) => p.percent > 99.999)!
    expect(peak.amount).toBeCloseTo(s.peakAmount, 9)
    expect(s.unitLabel).toBe('mcg')
  })

  it('reads 0% for a curve whose doses have all cleared', () => {
    const old = { ...daily, doses: [{ at: now - 60 * DAY, amount: 250 }] }
    const s = overlayModel([weekly, old], now).series[1]!
    expect(s.peakAmount).toBe(0)
    expect(s.points.every((p) => p.percent === 0)).toBe(true)
  })
})

describe('overlayWindow', () => {
  it('spans every curve but never more than four weeks either side of now', () => {
    const w = overlayWindow([weekly, daily], now)
    expect(w.start).toBeLessThanOrEqual(now - 3 * DAY)
    expect(w.end).toBeGreaterThan(now + 7 * DAY)
    expect(w.end - now).toBeLessThanOrEqual(28 * DAY)
    expect(now - w.start).toBeLessThanOrEqual(28 * DAY)
  })
})

describe('overlayTable', () => {
  it('gives one percentage per curve per row', () => {
    const inputs = [weekly, daily]
    const { window, series } = overlayModel(inputs, now)
    const rows = overlayTable(inputs, series, window)
    expect(rows).toHaveLength(13)
    expect(rows[0]!.at).toBe(window.start)
    expect(rows[12]!.at).toBe(window.end)
    expect(rows.every((r) => r.percents.length === 2)).toBe(true)
  })
})

describe('assignSlots', () => {
  it('fills the lowest free slot and caps at the maximum', () => {
    const slots = assignSlots(['a', 'b', 'c', 'd', 'e'], new Map())
    expect([...slots]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ])
    expect(OVERLAY_MAX).toBe(4)
  })

  it('never repaints a curve when another is removed or added', () => {
    const first = assignSlots(['a', 'b', 'c'], new Map())
    const removed = assignSlots(['a', 'c'], first)
    expect(removed.get('c')).toBe(2)
    const added = assignSlots(['a', 'c', 'd'], removed)
    expect(added.get('d')).toBe(1)
    expect(added.get('c')).toBe(2)
  })
})
