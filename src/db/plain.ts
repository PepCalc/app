/**
 * A copy of `value` made only of plain objects, arrays and primitives, so IndexedDB can clone
 * it. A Vue reactive proxy reads like the object it wraps but cannot be cloned; walking it
 * rebuilds the same data without the proxy. Binary data, dates and anything that is not a
 * plain object or array pass through untouched.
 */
export function toPlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(toPlain) as unknown as T
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)])) as T
}
