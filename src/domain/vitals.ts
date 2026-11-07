import { roundTo } from './units'

/**
 * Vitals: blood pressure in mmHg and resting heart rate in beats per minute. Both are read the
 * same way the world over, so there is no unit setting and nothing to convert. Values are
 * stored as entered, unrounded, and shown as whole numbers, as a cuff or a watch reports them.
 */
export type VitalKind = 'bp' | 'hr'

/**
 * Readings outside these are typos, not results. Each covers what a home cuff or a heart rate
 * monitor can report, with room either side.
 */
export const SYSTOLIC_RANGE = { min: 60, max: 260 } as const
export const DIASTOLIC_RANGE = { min: 30, max: 160 } as const
export const HEART_RATE_RANGE = { min: 25, max: 220 } as const

const within = (value: number, range: { min: number; max: number }) =>
  Number.isFinite(value) && value >= range.min && value <= range.max

/** A plausible pair: each number in range, and the top number above the bottom one. */
export function isValidBloodPressure(systolic: number, diastolic: number): boolean {
  return (
    within(systolic, SYSTOLIC_RANGE) && within(diastolic, DIASTOLIC_RANGE) && systolic > diastolic
  )
}

export function isValidHeartRate(bpm: number): boolean {
  return within(bpm, HEART_RATE_RANGE)
}

const whole = (value: number) => roundTo(value, 0)

/** "128/82 mmHg". */
export function formatBloodPressure(systolic: number, diastolic: number): string {
  return `${whole(systolic)}/${whole(diastolic)} mmHg`
}

/** "64 bpm". */
export function formatHeartRate(bpm: number): string {
  return `${whole(bpm)} bpm`
}

function signed(value: number): string {
  const size = whole(Math.abs(value))
  if (size === 0) return '0'
  return `${value > 0 ? '+' : '−'}${size}`
}

/** A signed change in each number: "−6/−3 mmHg". */
export function formatBloodPressureChange(systolicDelta: number, diastolicDelta: number): string {
  return `${signed(systolicDelta)}/${signed(diastolicDelta)} mmHg`
}

/** A signed change in heart rate: "+4 bpm". */
export function formatHeartRateChange(delta: number): string {
  return `${signed(delta)} bpm`
}
