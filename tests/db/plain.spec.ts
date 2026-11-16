import { isReactive, reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { toPlain } from '@/db/plain'

describe('toPlain', () => {
  it('returns primitives, null and undefined unchanged', () => {
    expect(toPlain(null)).toBeNull()
    expect(toPlain(undefined)).toBeUndefined()
    expect(toPlain(42)).toBe(42)
    expect(toPlain('hello')).toBe('hello')
    expect(toPlain(true)).toBe(true)
  })

  it('deep-copies nested plain objects and arrays without sharing references', () => {
    const input = { a: [{ b: 1 }], nested: { c: 'x' } }
    const result = toPlain(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    expect(result.a).not.toBe(input.a)
    expect(result.a[0]).not.toBe(input.a[0])
    expect(result.nested).not.toBe(input.nested)
  })

  it('strips Vue reactivity from refs and nested objects at every level', () => {
    const state = ref({ a: [{ b: 1 }], nested: { c: [2, 3] } })
    const result = toPlain(state.value)
    expect(result).toEqual({ a: [{ b: 1 }], nested: { c: [2, 3] } })
    expect(isReactive(result)).toBe(false)
    expect(isReactive(result.a)).toBe(false)
    expect(isReactive(result.a[0])).toBe(false)
    expect(isReactive(result.nested)).toBe(false)
    expect(isReactive(result.nested.c)).toBe(false)
  })

  it('strips Vue reactivity from nested children inside a plain spread shell', () => {
    const reactiveObject = reactive({ list: [{ x: 1 }], nested: { y: 2 } })
    const spread = { ...reactiveObject }
    expect(isReactive(spread)).toBe(false)
    expect(isReactive(spread.list)).toBe(true)

    const result = toPlain(spread)
    expect(result).toEqual({ list: [{ x: 1 }], nested: { y: 2 } })
    expect(isReactive(result)).toBe(false)
    expect(isReactive(result.list)).toBe(false)
    expect(isReactive(result.list[0])).toBe(false)
    expect(isReactive(result.nested)).toBe(false)
  })

  it('returns binary buffers and typed arrays by the same reference', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const bytes = new Uint8Array([4, 5, 6])
    const wrapped = reactive({ buffer, bytes })
    const result = toPlain(wrapped)
    expect(result.buffer).toBe(buffer)
    expect(result.bytes).toBe(bytes)
    expect(toPlain(buffer)).toBe(buffer)
    expect(toPlain(bytes)).toBe(bytes)
  })

  it('returns Date instances by the same reference', () => {
    const date = new Date('2026-11-16T00:00:00.000Z')
    expect(toPlain(date)).toBe(date)
    expect(toPlain({ date }).date).toBe(date)
  })

  it('copies objects created with Object.create(null)', () => {
    const nullProto = Object.create(null) as Record<string, unknown>
    nullProto.a = 1
    nullProto.nested = { b: [2] }
    const result = toPlain(nullProto)
    expect(result).toEqual({ a: 1, nested: { b: [2] } })
    expect(result).not.toBe(nullProto)
    expect(result.nested).not.toBe(nullProto.nested)
  })

  it('leaves the input unchanged', () => {
    const state = ref({ a: [{ b: 1 }] })
    const result = toPlain(state.value)
    result.a[0]!.b = 99
    expect(state.value).toEqual({ a: [{ b: 1 }] })
    expect(isReactive(state.value)).toBe(true)
    expect(isReactive(state.value.a[0])).toBe(true)
  })
})
