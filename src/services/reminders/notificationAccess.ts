/**
 * Whether PepCalc may notify, for the reminder screens. The web build has no way to schedule
 * a notification, so it is always "unsupported" there and never loads the native plugins.
 */
export type NotificationAccess = 'granted' | 'denied' | 'prompt' | 'unsupported'

const native = () => import('./nativeReminders')

export async function checkNotificationAccess(): Promise<NotificationAccess> {
  if (!__NATIVE__) return 'unsupported'
  return (await native()).checkAccess()
}

/** Asks the system for permission if it still can; resolves with the outcome. */
export async function requestNotificationAccess(): Promise<NotificationAccess> {
  if (!__NATIVE__) return 'unsupported'
  const { checkAccess, requestAccess } = await native()
  return (await checkAccess()) === 'granted' ? 'granted' : requestAccess()
}

/** Opens PepCalc's notification settings on the phone; false if that could not be done. */
export async function openNotificationSettings(): Promise<boolean> {
  if (!__NATIVE__) return false
  try {
    await (await native()).openSettings()
    return true
  } catch {
    return false
  }
}
