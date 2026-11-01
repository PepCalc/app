/**
 * Hand a file to the user without any network: the share sheet on phones (save to Files,
 * AirDrop, a messaging app) and a plain download elsewhere. The native apps' WebViews support
 * neither Web Share with files nor blob downloads, so it uses the native share sheet. `data` is
 * text (a backup) or a Blob (an image); the MIME type comes from the Blob when it has one.
 */
export async function saveFile(
  name: string,
  data: string | Blob,
  mime = 'application/json',
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (__NATIVE__) {
    const { shareNative } = await import('./nativeFileTransfer')
    return shareNative(name, data)
  }
  const file = new File([data], name, {
    type: typeof data === 'string' ? mime : data.type || mime,
  })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Some browsers advertise file sharing but refuse at runtime; fall back to download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
