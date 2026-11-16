import { describe, expect, it } from 'vitest'
import { rangeWindow, usefulRanges } from '@/domain/range'

const DAY_MS = 86_400_000
const NOW = Date.UTC(2026, 10, 16)

describe('rangeWindow', () => {
  it('returns a 30-day window ending at now for 1M, and null for All', () => {
    expect(rangeWindow('1M', NOW)).toEqual({ start: NOW - 30 * DAY_MS, end: NOW })
    expect(rangeWindow('3M', NOW)).toEqual({ start: NOW - 91 * DAY_MS, end: NOW })
    expect(rangeWindow('6M', NOW)).toEqual({ start: NOW - 182 * DAY_MS, end: NOW })
    expect(rangeWindow('1Y', NOW)).toEqual({ start: NOW - 365 * DAY_MS, end: NOW })
    expect(rangeWindow('All', NOW)).toBeNull()
  })
})

describe('usefulRanges', () => {
  it('offers only the shorter ranges the data spans beyond', () => {
    expect(usefulRanges(NOW - 42 * DAY_MS, NOW)).toEqual(['1M', 'All'])
    expect(usefulRanges(NOW - 210 * DAY_MS, NOW)).toEqual(['1M', '3M', '6M', 'All'])
    expect(usefulRanges(NOW - 730 * DAY_MS, NOW)).toEqual(['1M', '3M', '6M', '1Y', 'All'])
    expect(usefulRanges(NOW - 29 * DAY_MS, NOW)).toEqual(['All'])
    expect(usefulRanges(null, NOW)).toEqual(['All'])
  })
})
