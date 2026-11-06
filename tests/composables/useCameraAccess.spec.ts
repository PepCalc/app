import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useCameraAccess } from '@/composables/useCameraAccess'
import type { CameraAccess } from '@/services/photos/cameraAccess'

const service = vi.hoisted(() => ({
  checkCameraAccess: vi.fn<() => Promise<CameraAccess>>(),
  markCameraAsked: vi.fn(async () => {}),
  openCameraSettings: vi.fn(async () => true),
}))
vi.mock('@/services/photos/cameraAccess', () => service)

const settled = async () => {
  await Promise.resolve()
  await nextTick()
}

async function setUp(access: CameraAccess) {
  service.checkCameraAccess.mockResolvedValue(access)
  const capture = vi.fn()
  let camera!: ReturnType<typeof useCameraAccess>
  mount(
    defineComponent({
      setup() {
        camera = useCameraAccess(capture)
        return () => null
      },
    }),
  )
  await settled()
  return { camera, capture }
}

describe('useCameraAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens the input at once in a browser, which has no permission of its own', async () => {
    const { camera, capture } = await setUp('unsupported')
    camera.actions.takePhoto()
    expect(capture).toHaveBeenCalledOnce()
    expect(camera.state.explaining).toBe(false)
  })

  it('opens the input at once when access is already granted', async () => {
    const { camera, capture } = await setUp('granted')
    camera.actions.takePhoto()
    expect(capture).toHaveBeenCalledOnce()
  })

  it('explains before anything reaches the system', async () => {
    const { camera, capture } = await setUp('prompt')
    camera.actions.takePhoto()
    expect(camera.state.explaining).toBe(true)
    expect(capture).not.toHaveBeenCalled()
    expect(service.markCameraAsked).not.toHaveBeenCalled()
  })

  it('opens the input in the same tap as Allow, or the browser would block it', async () => {
    const { camera, capture } = await setUp('prompt')
    camera.actions.takePhoto()
    camera.actions.allow()
    expect(capture).toHaveBeenCalledOnce()
    expect(service.markCameraAsked).toHaveBeenCalledOnce()
    expect(camera.state.explaining).toBe(false)
  })

  it('never opens the input after a refusal for good, and offers the way out', async () => {
    const { camera, capture } = await setUp('denied')
    camera.actions.takePhoto()
    expect(camera.state.explaining).toBe(true)
    expect(capture).not.toHaveBeenCalled()
  })

  it('shows the way out as soon as the system refuses for good', async () => {
    const { camera } = await setUp('prompt')
    camera.actions.takePhoto()
    camera.actions.allow()
    service.checkCameraAccess.mockResolvedValue('denied')
    await camera.actions.settle()
    expect(camera.state.access).toBe('denied')
    expect(camera.state.explaining).toBe(true)
  })

  it('stays quiet after a first refusal the system can ask about again', async () => {
    const { camera } = await setUp('prompt')
    camera.actions.takePhoto()
    camera.actions.allow()
    await camera.actions.settle()
    expect(camera.state.explaining).toBe(false)
  })

  it('stays quiet when a user who already refused cancels the library', async () => {
    const { camera } = await setUp('denied')
    await camera.actions.settle()
    expect(camera.state.explaining).toBe(false)
  })

  it('notices access granted in settings on returning to the app', async () => {
    const { camera } = await setUp('denied')
    camera.actions.takePhoto()
    service.checkCameraAccess.mockResolvedValue('granted')
    document.dispatchEvent(new Event('visibilitychange'))
    await settled()
    expect(camera.state.access).toBe('granted')
    expect(camera.state.explaining).toBe(false)
  })
})
