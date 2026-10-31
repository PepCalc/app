/**
 * Arithmetic for cropping a photo: the frame a crop starts from, moving it or dragging one of
 * its corners while it stays inside the image, and turning it into whole source pixels. Every
 * rect here is in the image's own pixels; drawing the crop happens in `services/photos`.
 */

export interface Size {
  width: number
  height: number
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** What a drag holds: the whole frame, or one corner (north-west, north-east, and so on). */
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

export const CROP_HANDLES = ['nw', 'ne', 'sw', 'se'] as const

/** The smallest frame, as a share of the image's shorter side, so a crop never collapses. */
const MIN_CROP_FRACTION = 0.1

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function minSide(bounds: Size): number {
  return Math.min(bounds.width, bounds.height) * MIN_CROP_FRACTION
}

/**
 * Where a crop starts: the whole image when the shape is free (`ratio` null), otherwise the
 * largest centred frame of `ratio` (width over height) that fits.
 */
export function initialCrop(bounds: Size, ratio: number | null): CropRect {
  if (ratio === null) return { x: 0, y: 0, width: bounds.width, height: bounds.height }
  const width = Math.min(bounds.width, bounds.height * ratio)
  const height = width / ratio
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height }
}

/**
 * `start` after a drag of (`dx`, `dy`) on `handle`. Moving keeps the size and stops at the
 * image's edges. A corner drag keeps the opposite corner fixed, never grows past the image or
 * shrinks below the minimum, and with a `ratio` keeps that shape, following whichever of the
 * two directions the finger moved further.
 */
export function dragCrop(
  start: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Size,
  ratio: number | null,
): CropRect {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, bounds.width - start.width),
      y: clamp(start.y + dy, 0, bounds.height - start.height),
    }
  }
  const east = handle === 'ne' || handle === 'se'
  const south = handle === 'sw' || handle === 'se'
  const anchorX = east ? start.x : start.x + start.width
  const anchorY = south ? start.y : start.y + start.height
  const maxW = east ? bounds.width - anchorX : anchorX
  const maxH = south ? bounds.height - anchorY : anchorY
  const min = minSide(bounds)
  let width = start.width + (east ? dx : -dx)
  let height = start.height + (south ? dy : -dy)
  if (ratio === null) {
    width = clamp(width, Math.min(min, maxW), maxW)
    height = clamp(height, Math.min(min, maxH), maxH)
  } else {
    const minW = Math.max(min, min * ratio)
    const limitW = Math.min(maxW, maxH * ratio)
    const wanted = Math.abs(width - start.width) >= Math.abs(height - start.height) * ratio
    width = clamp(wanted ? width : height * ratio, Math.min(minW, limitW), limitW)
    height = width / ratio
  }
  return {
    x: east ? anchorX : anchorX - width,
    y: south ? anchorY : anchorY - height,
    width,
    height,
  }
}

/** True when `rect` keeps (to within a pixel) the whole image, so there is nothing to crop. */
export function isFullFrame(rect: CropRect, bounds: Size): boolean {
  return (
    rect.x < 1 &&
    rect.y < 1 &&
    rect.width > bounds.width - 1 - rect.x &&
    rect.height > bounds.height - 1 - rect.y
  )
}

/** `rect` as whole pixels inside `bounds`, at least one pixel each way, for drawing. */
export function toPixelRect(rect: CropRect, bounds: Size): CropRect {
  const x = clamp(Math.round(rect.x), 0, bounds.width - 1)
  const y = clamp(Math.round(rect.y), 0, bounds.height - 1)
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, bounds.width - x),
    height: clamp(Math.round(rect.height), 1, bounds.height - y),
  }
}
