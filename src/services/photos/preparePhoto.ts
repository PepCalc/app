import { toPixelRect, type CropRect } from '@/domain/crop'
import { fitWithin, IMAGE_EDGE, THUMB_EDGE } from '@/domain/photos'

export interface PreparedPhoto {
  image: ArrayBuffer
  thumb: ArrayBuffer
  width: number
  height: number
}

export class PhotoReadError extends Error {
  constructor() {
    super("Couldn't read that photo. Try a JPEG or PNG.")
    this.name = 'PhotoReadError'
  }
}

/** Decodes with the camera's orientation applied, so a portrait photo stays upright. */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Some WebViews decode only through an <img> (which also honours the orientation).
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } catch {
      throw new PhotoReadError()
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/** Draws `region` of `source` at `width` × `height` and encodes it as a JPEG. */
async function encode(
  source: ImageBitmap | HTMLImageElement,
  region: CropRect,
  width: number,
  height: number,
  quality: number,
): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoReadError()
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new PhotoReadError()
  return blob.arrayBuffer()
}

/**
 * The stored image and thumbnail for `crop` of `file` (the whole of it without one), each
 * scaled to fit its edge. Closes the decoded source when done.
 */
async function prepare(file: Blob, crop?: CropRect): Promise<PreparedPhoto> {
  const source = await decode(file)
  try {
    const naturalWidth = 'naturalWidth' in source ? source.naturalWidth : source.width
    const naturalHeight = 'naturalHeight' in source ? source.naturalHeight : source.height
    if (!(naturalWidth > 0) || !(naturalHeight > 0)) throw new PhotoReadError()
    const bounds = { width: naturalWidth, height: naturalHeight }
    const region = crop ? toPixelRect(crop, bounds) : { x: 0, y: 0, ...bounds }
    const size = fitWithin(region.width, region.height, IMAGE_EDGE)
    const thumbSize = fitWithin(region.width, region.height, THUMB_EDGE)
    const [image, thumb] = await Promise.all([
      encode(source, region, size.width, size.height, 0.85),
      encode(source, region, thumbSize.width, thumbSize.height, 0.8),
    ])
    return { image, thumb, ...size }
  } finally {
    if ('close' in source) source.close()
  }
}

/**
 * Re-encode a chosen or captured photo as a stored image and a thumbnail. Redrawing through a
 * canvas keeps only the pixels: EXIF metadata, including the GPS location phones embed, never
 * reaches the database or a backup.
 */
export function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  return prepare(file)
}

/**
 * `photo` cut down to `crop`, in the photo's own pixels, with a fresh thumbnail. It works from
 * the prepared image rather than the original file: that is already upright and stripped, and
 * on Android the camera's file is deleted as soon as it has been read.
 */
export function cropPhoto(photo: PreparedPhoto, crop: CropRect): Promise<PreparedPhoto> {
  return prepare(new Blob([photo.image], { type: 'image/jpeg' }), crop)
}

/**
 * The Android WebView saves a camera capture in the app's own Pictures folder before handing it
 * over. PepCalc keeps its own stripped copy, so the original (with its location data) is
 * deleted. Never throws: a leftover file is private to the app and removed on uninstall. iOS
 * hands over a temporary file the system removes itself.
 */
export async function clearNativeCaptures(): Promise<void> {
  if (__PLATFORM__ !== 'android') return
  try {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    const { files } = await Filesystem.readdir({ path: 'Pictures', directory: Directory.External })
    await Promise.all(
      files
        .filter((f) => /^JPEG_.*\.jpg$/.test(f.name))
        .map((f) =>
          Filesystem.deleteFile({ path: `Pictures/${f.name}`, directory: Directory.External }),
        ),
    )
  } catch {
    // Nothing captured yet, so there is no folder.
  }
}
