import { describe, expect, it } from 'vitest'
import type { ChartColors } from '@/composables/useChartColors'
import { drawDoseLegend } from '@/components/share/shareCard'
import type { DoseLegendItem } from '@/domain/doseBands'

const COLORS = {
  logged: '#1c6468',
  preview: '#c0643f',
  grid: '#e8ddcc',
  axis: '#7a6c54',
  now: '#877960',
  doses: ['#5f5544', '#246bc2', '#b55633', '#125659', '#8f6114', '#8c3d86', '#1e6940', '#473fa3'],
  onDose: '#fffdf9',
  text: '#1d1a14',
  surface: '#fffdf9',
  font: 'Hanken Grotesk',
} as ChartColors

function fakeCtx() {
  const texts: { text: string; x: number; y: number }[] = []
  const ctx = {
    font: '',
    fillStyle: '',
    measureText: (s: string) => ({ width: s.length * 14 }),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
  } as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}

describe('drawDoseLegend', () => {
  it('draws swatches and wraps onto a second row when items exceed width', () => {
    const { ctx, texts } = fakeCtx()
    const legend: DoseLegendItem[] = [
      { slot: 0, key: 'sema', label: 'Wegovy', amount: 0.25, unitLabel: 'mg' },
      { slot: 1, key: 'sema', label: 'Wegovy', amount: 0.5, unitLabel: 'mg' },
      { slot: 2, key: 'tirz', label: 'Zepbound', amount: 2.5, unitLabel: 'mg' },
    ]
    const height = drawDoseLegend(ctx, legend, true, { x: 0, y: 0, width: 500 }, COLORS)
    expect(height).toBe(72)
    expect(texts.map((t) => t.text)).toEqual(['Wegovy 0.25 mg', 'Wegovy 0.5 mg', 'Zepbound 2.5 mg'])
    expect(texts[2]!.y).toBeGreaterThan(texts[0]!.y)
  })
})
