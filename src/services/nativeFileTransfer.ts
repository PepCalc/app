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
  const { uri } = await Filesystem.writeFile(
    typeof data === 'string'
      ? { path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 }
      : { path: name, data: await toBase64(data), directory: Directory.Cache },
  )
  try {
    await Share.share({ title: name, files: [uri] })
    return 'shared'
  } catch (e) {
    // The plugin rejects with this message, not an error code, when the sheet is dismissed.
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled'
    throw e
  }
}
