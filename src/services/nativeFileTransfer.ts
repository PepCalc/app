import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** Base64 of a Blob's bytes, the form Capacitor's Filesystem takes for binary files. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/*
 * A backup with photos can run to tens of megabytes. Crossing the native bridge as one base64
 * string would hold several copies of it in memory at once, so binary files are written in
 * slices and appended. A multiple of 3 keeps each slice's base64 free of padding.
 */
const SLICE_BYTES = 3 * 1024 * 1024

async function writeBlob(path: string, blob: Blob): Promise<string> {
  const { uri } = await Filesystem.writeFile({
    path,
    data: await toBase64(blob.slice(0, SLICE_BYTES)),
    directory: Directory.Cache,
  })
  for (let start = SLICE_BYTES; start < blob.size; start += SLICE_BYTES) {
    await Filesystem.appendFile({
      path,
      data: await toBase64(blob.slice(start, start + SLICE_BYTES)),
      directory: Directory.Cache,
    })
  }
  return uri
}

/**
 * Write the file to the app's cache and open the system share sheet on it (save to Files,
 * Drive, a messaging app). Text is written as UTF-8, a Blob as its raw bytes. Resolves
 * 'cancelled' when the user dismisses the sheet; other failures throw. Only imported by the
 * native build.
 */
export async function shareNative(
  name: string,
  data: string | Blob,
): Promise<'shared' | 'cancelled'> {
  const uri =
    typeof data === 'string'
      ? (
          await Filesystem.writeFile({
            path: name,
            data,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
          })
        ).uri
      : await writeBlob(name, data)
  try {
    await Share.share({ title: name, files: [uri] })
    return 'shared'
  } catch (e) {
    // The plugin rejects with this message, not an error code, when the sheet is dismissed.
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled'
    throw e
  }
}
