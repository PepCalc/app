/**
 * Geometry for a shared photo collage: the canvas for each format, a grid of equal photo tiles
 * that fills the space it is given, the crop that fills a tile without stretching, and each
 * tile's label. Drawing happens in `components/share/collageCard.ts`.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type CollageFormat = 'post' | 'story'

/** A 4:5 post shows uncropped in messaging apps and feeds; 9:16 fills a phone for a story. */
export const COLLAGE_FORMATS: Record<CollageFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

/** How many photos a collage can hold. */
export const COLLAGE_COUNTS = [2, 3, 4, 6] as const

/** Photos are portrait, so tiles are 3:4 whatever the grid. */
const TILE_ASPECT = 3 / 4

/**
 * `count` equal 3:4 tiles in reading order, in whichever grid makes them largest inside `box`,
 * centred. Two photos sit side by side, four make a square, six a 3 × 2 or 2 × 3 grid.
 */
export function gridLayout(count: number, box: Rect, gap: number): Rect[] {
  if (count < 1) return []
  let best = { cols: 1, rows: count, width: 0 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const cellW = (box.width - gap * (cols - 1)) / cols
    const cellH = (box.height - gap * (rows - 1)) / rows
    const width = Math.min(cellW, cellH * TILE_ASPECT)
    // Prefer the fuller grid on a tie, so four photos make 2 × 2 rather than 4 × 1 with gaps.
    if (width > best.width + 0.5) best = { cols, rows, width }
  }
  const { cols, rows, width } = best
  const height = width / TILE_ASPECT
  const gridW = cols * width + gap * (cols - 1)
  const gridH = rows * height + gap * (rows - 1)
  const left = box.x + (box.width - gridW) / 2
  const top = box.y + (box.height - gridH) / 2
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols)
    // A short last row is centred under the rows above it.
    const inRow = row === rows - 1 ? count - row * cols : cols
    const rowLeft = left + ((cols - inRow) * (width + gap)) / 2
    return {
      x: rowLeft + (i % cols) * (width + gap),
      y: top + row * (height + gap),
      width,
      height,
    }
  })
}

/**
 * The part of a `srcW` × `srcH` image that fills a `dstW` × `dstH` tile without stretching:
 * the full width or height, centred, with a small upward bias so heads are not cut first.
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const width = dstW / scale
  const height = dstH / scale
  return {
    x: (srcW - width) / 2,
    y: (srcH - height) * 0.4,
    width,
    height,
  }
}

const WEEK_MS = 7 * 86_400_000

/**
 * "Week 6" counted from `startAt`, or "Before week 1" for a photo taken before it. Null without
 * a start, so the caller falls back to dates.
 */
export function weekLabel(at: number, startAt: number | null): string | null {
  if (startAt === null) return null
  if (at < startAt) return 'Before week 1'
  return `Week ${Math.floor((at - startAt) / WEEK_MS)}`
}
