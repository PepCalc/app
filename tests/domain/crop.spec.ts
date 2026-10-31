import { describe, expect, it } from 'vitest'
import { dragCrop, initialCrop, isFullFrame, toPixelRect } from '@/domain/crop'

const bounds = { width: 1200, height: 1600 }

describe('initialCrop', () => {
  it('starts on the whole image when the shape is free', () => {
    expect(initialCrop(bounds, null)).toEqual({ x: 0, y: 0, width: 1200, height: 1600 })
  })

  it('starts on the largest centred frame of a fixed shape', () => {
    expect(initialCrop(bounds, 1)).toEqual({ x: 0, y: 200, width: 1200, height: 1200 })
    expect(initialCrop({ width: 1600, height: 900 }, 3 / 4)).toEqual({
      x: 462.5,
      y: 0,
      width: 675,
      height: 900,
    })
  })
})

describe('dragCrop', () => {
  const start = { x: 200, y: 200, width: 600, height: 800 }

  it('moves the frame without resizing it, stopping at the edges', () => {
    expect(dragCrop(start, 'move', 50, -20, bounds, null)).toEqual({
      ...start,
      x: 250,
      y: 180,
    })
    expect(dragCrop(start, 'move', 5000, -5000, bounds, null)).toEqual({
      ...start,
      x: 600,
      y: 0,
    })
  })

  it('resizes from a corner while the opposite corner stays put', () => {
    expect(dragCrop(start, 'se', 100, 50, bounds, null)).toEqual({
      x: 200,
      y: 200,
      width: 700,
      height: 850,
    })
    expect(dragCrop(start, 'nw', 100, 50, bounds, null)).toEqual({
      x: 300,
      y: 250,
      width: 500,
      height: 750,
    })
  })

  it('never grows past the image or shrinks below the minimum', () => {
    const grown = dragCrop(start, 'nw', -5000, -5000, bounds, null)
    expect(grown).toEqual({ x: 0, y: 0, width: 800, height: 1000 })
    const shrunk = dragCrop(start, 'se', -5000, -5000, bounds, null)
    // The minimum is a tenth of the shorter side: 120 px.
    expect(shrunk).toEqual({ x: 200, y: 200, width: 120, height: 120 })
  })

  it('keeps a fixed shape, following the larger movement', () => {
    const square = { x: 100, y: 100, width: 400, height: 400 }
    expect(dragCrop(square, 'se', 200, 10, bounds, 1)).toEqual({
      x: 100,
      y: 100,
      width: 600,
      height: 600,
    })
    expect(dragCrop(square, 'ne', 0, -50, bounds, 1)).toEqual({
      x: 100,
      y: 50,
      width: 450,
      height: 450,
    })
  })

  it('stops a fixed shape at whichever edge it meets first', () => {
    const square = { x: 100, y: 100, width: 400, height: 400 }
    const r = dragCrop(square, 'se', 5000, 0, bounds, 1)
    expect(r).toEqual({ x: 100, y: 100, width: 1100, height: 1100 })
  })
})

describe('isFullFrame', () => {
  it('is true only when the frame keeps the whole image', () => {
    expect(isFullFrame({ x: 0, y: 0, width: 1200, height: 1600 }, bounds)).toBe(true)
    expect(isFullFrame({ x: 0.4, y: 0, width: 1199.5, height: 1600 }, bounds)).toBe(true)
    expect(isFullFrame({ x: 0, y: 0, width: 1100, height: 1600 }, bounds)).toBe(false)
    expect(isFullFrame({ x: 50, y: 0, width: 1150, height: 1600 }, bounds)).toBe(false)
  })
})

describe('toPixelRect', () => {
  it('rounds to whole pixels that stay inside the image', () => {
    expect(toPixelRect({ x: 10.4, y: 20.6, width: 300.5, height: 400.2 }, bounds)).toEqual({
      x: 10,
      y: 21,
      width: 301,
      height: 400,
    })
    expect(toPixelRect({ x: 1199.8, y: 0, width: 5, height: 5000 }, bounds)).toEqual({
      x: 1199,
      y: 0,
      width: 1,
      height: 1600,
    })
  })
})
