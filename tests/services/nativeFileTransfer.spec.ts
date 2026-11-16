import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeFile = vi.fn()
const appendFile = vi.fn()
const share = vi.fn()

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile, appendFile },
}))
vi.mock('@capacitor/share', () => ({ Share: { share } }))

const { shareNative } = await import('@/services/nativeFileTransfer')

describe('shareNative', () => {
  beforeEach(() => {
    writeFile.mockReset().mockResolvedValue({ uri: 'file:///cache/backup.json' })
    appendFile.mockReset().mockResolvedValue(undefined)
    share.mockReset().mockResolvedValue({})
  })

  it('writes the text to the cache and shares that file', async () => {
    await expect(shareNative('backup.json', '{"v":1}')).resolves.toBe('shared')
    expect(writeFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: '{"v":1}',
      directory: 'CACHE',
      encoding: 'utf8',
    })
    expect(share).toHaveBeenCalledWith({
      title: 'backup.json',
      files: ['file:///cache/backup.json'],
    })
  })

  it('writes a Blob as base64 bytes, without a text encoding', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    await expect(shareNative('levels.png', png)).resolves.toBe('shared')
    expect(writeFile).toHaveBeenCalledWith({
      path: 'levels.png',
      data: 'iVBORw==',
      directory: 'CACHE',
    })
  })

  it('writes a large Blob in appended slices', async () => {
    const big = new Blob([new Uint8Array(7 * 1024 * 1024)])
    await expect(shareNative('backup.zip', big)).resolves.toBe('shared')
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(appendFile).toHaveBeenCalledTimes(2)
    const written = [writeFile.mock.calls[0]![0], ...appendFile.mock.calls.map((c) => c[0])]
    const bytes = written.reduce((sum, call: { data: string }) => sum + atob(call.data).length, 0)
    expect(bytes).toBe(big.size)
  })

  it('reports a dismissed share sheet as cancelled', async () => {
    share.mockRejectedValue(new Error('Share canceled'))
    await expect(shareNative('backup.json', '{}')).resolves.toBe('cancelled')
  })

  it('rethrows any other failure', async () => {
    share.mockRejectedValue(new Error('No app can handle this'))
    await expect(shareNative('backup.json', '{}')).rejects.toThrow('No app can handle this')
  })
})
