/** Local wall-clock time of day, independent of time zones. */
export interface TimeOfDay {
  /** 0 to 23. */
  hour: number
  /** 0 to 59. */
  minute: number
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** "09:05" for an <input type="time">. */
export function toTimeValue(t: TimeOfDay): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

/** Parses an <input type="time"> value; null when it is empty or malformed. */
export function fromTimeValue(value: string): TimeOfDay | null {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return isInt(hour, 0, 23) && isInt(minute, 0, 59) ? { hour, minute } : null
}
