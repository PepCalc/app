import { describe, expect, it } from 'vitest'
import { findPeptide } from '@/data'
import { groupLevelsByPeptide } from '@/domain/levels'
import { A4, LETTER } from '@/services/pdf/pageSize'
import { availableSections, collectReport, pageSizeFor } from '@/services/report/collectReport'
import { NOW, sampleSource } from './fixtures'
import type { ReportSection } from '@/services/report/reportData'

const DAY = 86_400_000
const byName = (period: '30d' | '90d' | 'all') =>
  new Map(collectReport(sampleSource(period)).peptides!.map((p) => [p.name, p]))
const only = (sections: ReportSection[], period: '30d' | '90d' | 'all' = '90d') =>
  collectReport({ ...sampleSource(period), sections })

describe('collectReport', () => {
  it('lists only draws in the period, newest first', () => {
    const recent = collectReport(sampleSource('30d'))
    const all = collectReport(sampleSource('all'))
    expect(recent.draws!.rows.length).toBeLessThan(all.draws!.rows.length)
    expect(all.draws!.rows).toHaveLength(33)
    expect(recent.summary).toContainEqual(['Draws', String(recent.draws!.rows.length)])
    expect(recent.summary).toContainEqual(['Peptides', '3'])
    expect(recent.draws!.rows[0]![1]).toBe('BPC-157')
  })

  it('totals each peptide without mixing units, in the unit drawn', () => {
    expect(byName('all').get('BPC-157')!.stats).toContainEqual(['Total drawn', '5000 mcg'])
    expect(byName('all').get('Semaglutide')!.stats).toContainEqual(['Total drawn', '5 mg'])
  })

  it('gives a catalog curve its label source and every citation', () => {
    const sema = byName('90d').get('Semaglutide')!
    expect(sema.pk!.sourceLabel).toBe('Prescribing label')
    expect(sema.pk!.userSupplied).toBe(false)
    expect(sema.pk!.citations.length).toBeGreaterThan(0)
    expect(sema.pk!.citations[0]).toMatch(/^Prescribing label: /)
  })

  it('marks a vial override as user-supplied, with no catalog citations', () => {
    const custom = [...byName('90d').values()].find((p) => p.pk?.userSupplied)!
    expect(custom.pk!.sourceLabel).toBe('User-supplied values')
    expect(custom.pk!.citations).toEqual([])
    expect(custom.curve).not.toBeNull()
  })

  it('explains why a peptide without human PK data has no curve', () => {
    const bpc = byName('90d').get('BPC-157')!
    expect(bpc.curve).toBeNull()
    expect(bpc.noCurveReason).toMatch(/pharmacokinetic/i)
  })

  it('starts the curve at the period but counts the doses before it', () => {
    const sema = byName('30d').get('Semaglutide')!
    const chart = sema.curve!.chart
    expect(chart.window.start).toBeGreaterThan(NOW - 31 * DAY)
    expect(chart.series[0]!.points[0]!.value).toBeGreaterThan(0)
    for (const at of chart.markers) expect(at).toBeGreaterThanOrEqual(chart.window.start)
  })

  it('omits peptides with no draws in the period', () => {
    const names = [...byName('30d').keys()]
    expect(names).toHaveLength(3)
    const old = collectReport({ ...sampleSource('30d'), now: NOW + 200 * DAY })
    expect(old.peptides).toBeNull()
    expect(old.draws).toBeNull()
  })
})

describe('pageSizeFor', () => {
  it('uses Letter where it is the paper standard and A4 elsewhere', () => {
    expect(pageSizeFor('en-US')).toBe(LETTER)
    expect(pageSizeFor('es-MX')).toBe(LETTER)
    expect(pageSizeFor('en-GB')).toBe(A4)
    expect(pageSizeFor('de')).toBe(A4)
    expect(pageSizeFor('not a locale')).toBe(A4)
  })
})

describe('collectReport for a short-acting peptide', () => {
  it('trims the chart to recent days and says so, keeping every draw in the log', () => {
    const base = sampleSource('90d')
    const vial = { ...base.vials[0]!, id: 'tesa', peptideId: 'tesamorelin', name: 'Tesamorelin' }
    const draws = Array.from({ length: 60 }, (_, i) => ({
      ...base.draws[0]!,
      id: `t${i}`,
      vialId: 'tesa',
      takenAt: new Date(NOW - (60 - i) * DAY).toISOString(),
      dose: { value: 2, unit: 'mg' as const },
    }))
    const tesa = findPeptide('tesamorelin')!
    const groups = groupLevelsByPeptide(
      [
        {
          id: 'tesa',
          peptideId: 'tesamorelin',
          label: 'Tesamorelin',
          pk: { params: tesa.pk!, userSupplied: false },
        },
      ],
      draws.map((d) => ({ vialId: 'tesa', at: Date.parse(d.takenAt), dose: d.dose })),
    )
    const report = collectReport({ ...base, vials: [vial], draws, groups })
    const curve = report.peptides![0]!.curve!
    expect(curve.note).toMatch(/3 days/)
    expect(curve.chart.window.end - curve.chart.window.start).toBeLessThan(5 * DAY)
    expect(report.draws!.rows).toHaveLength(60)
  })
})

describe('collectReport sections', () => {
  it('prints only the chosen sections', () => {
    const report = only(['weight', 'symptoms'])
    expect(report.weight).not.toBeNull()
    expect(report.symptoms).not.toBeNull()
    expect(report.peptides).toBeNull()
    expect(report.draws).toBeNull()
    expect(report.combined).toBeNull()
    expect(report.sugar).toBeNull()
    expect(report.title).toBe('Journal')
    expect(only(['draws', 'levels']).title).toBe('Draws and estimated levels')
    expect(only(['draws', 'weight']).title).toBe('Peptides and journal')
  })

  it('offers only sections with something in the period', () => {
    const { sections: _, ...source } = sampleSource('30d')
    const bare = availableSections({
      ...source,
      weights: [],
      glucose: [],
      vitals: [],
      symptoms: [],
    })
    expect([...bare].sort()).toEqual(['combined', 'draws', 'levels'])
    const empty = availableSections({ ...source, now: NOW + 400 * DAY })
    expect(empty.size).toBe(0)
  })

  it('charts systolic and diastolic, with the change in both', () => {
    const vitals = only(['vitals']).vitals!
    expect(vitals.stats).toContainEqual(['Latest blood pressure', '126/81 mmHg'])
    expect(vitals.stats).toContainEqual(['Change', '−8/−5 mmHg'])
    expect(vitals.bloodPressureChart!.series.map((s) => [s.label, s.style])).toEqual([
      ['Systolic', 'line'],
      ['Diastolic', 'dashed'],
    ])
    // One heart rate reading has no span to chart; it still prints in the table.
    expect(vitals.heartRateChart).toBeNull()
    expect(vitals.heartRate.rows).toEqual([[expect.any(String), '66 bpm', '', '']])
    expect(only(['vitals']).title).toBe('Journal')
    const combined = only(['combined', 'vitals']).combined!
    expect(combined.panels.map((p) => p.title)).toEqual([
      'Blood pressure (mmHg)',
      'Resting heart rate (bpm)',
    ])
  })

  it('reports weight change and BMI with its WHO band, in the chosen unit', () => {
    const report = collectReport({
      ...sampleSource('90d'),
      units: { weight: 'lb', a1c: '%', glucose: 'mg/dL' },
    })
    const stats = new Map(report.weight!.stats)
    expect(stats.get('Latest')).toBe('198.4 lb')
    // 90 kg / 1.75² = 29.4.
    expect(stats.get('BMI')).toBe('29.4')
    expect(stats.get('BMI band')).toBe('Above the healthy range')
    expect(report.weight!.weight!.unitLabel).toBe('lb')
    expect(report.weight!.bmi!.guides.map((g) => g.value)).toContain(30)
    expect(report.weight!.notes.join(' ')).toMatch(/WHO Technical Report Series 894/)
  })

  it('leaves out BMI without a height', () => {
    const noHeight = collectReport({
      ...sampleSource(),
      profile: { heightCm: null },
    })
    expect(noHeight.weight!.bmi).toBeNull()
    expect(new Map(noHeight.weight!.stats).has('BMI')).toBe(false)
  })

  it('draws fasting glucose as the line and other readings as hollow points', () => {
    const chart = collectReport(sampleSource()).sugar!.glucoseChart!
    expect(chart.series.map((s) => [s.label, s.style])).toEqual([
      ['Fasting', 'line'],
      ['Other times', 'hollow'],
    ])
    const mmol = collectReport({
      ...sampleSource(),
      units: { weight: 'kg', a1c: 'mmol/mol', glucose: 'mmol/L' },
    }).sugar!
    expect(mmol.glucose.rows[0]![1]).toBe('7.2 mmol/L')
    expect(mmol.a1c.rows[0]![1]).toBe('49 mmol/mol')
  })

  it('times side effects from the draw before them', () => {
    const rows = collectReport(sampleSource()).symptoms!.table.rows
    expect(rows[0]![0]).toBe('Nausea')
    expect(rows[0]![1]).toBe('2')
    expect(rows[0]![2]).toBe('1 mild, 1 moderate')
    expect(rows[0]![3]).toMatch(/days? after a draw$/)
  })

  it('stacks the combined chart on the period, with events for peptides without a curve', () => {
    const combined = collectReport(sampleSource('90d')).combined!
    expect(combined.window).toEqual({ start: NOW - 90 * DAY, end: NOW })
    const titles = combined.panels.map((p) => p.title)
    expect(titles.slice(0, 5)).toEqual([
      'Weight (kg)',
      'HbA1c (%)',
      'Glucose (mg/dL)',
      'Blood pressure (mmHg)',
      'Resting heart rate (bpm)',
    ])
    expect(titles.slice(5).sort()).toEqual([
      expect.stringMatching(/^Lab peptide .*, estimated \(mg\)$/),
      'Semaglutide, estimated (mg)',
    ])
    for (const panel of combined.panels) expect(panel.window).toEqual(combined.window)
    expect(combined.timeline.map((r) => r.label)).toEqual(['BPC-157 draws', 'Side effects'])
    // The whole period, not the levels section's trimmed window.
    const sema = combined.panels.find((p) => p.title?.startsWith('Semaglutide'))!
    expect(sema.markers).toHaveLength(12)
  })

  it('keeps a left-out section out of the combined chart too', () => {
    const combined = only(['combined', 'weight']).combined!
    expect(combined.panels.map((p) => p.title)).toEqual(['Weight (kg)'])
    expect(combined.timeline).toEqual([])
    expect(only(['combined']).combined).toBeNull()
  })

  it('counts journal entries when dating "everything logged"', () => {
    const { draws: _, ...rest } = sampleSource('all')
    const report = collectReport({ ...rest, draws: [], sections: ['combined', 'sugar'] })
    // The oldest row is the first HbA1c result.
    expect(report.combined!.window.start).toBe(NOW - 80 * DAY)
  })
})
