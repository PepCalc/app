/**
 * Words that depend on which build is running, so copy names the right phone and settings
 * screen. Fixed at build time (`__PLATFORM__`), so each bundle carries only its own.
 */

/** The phone's system, as copy names it: "in Android settings". */
export const systemName = __PLATFORM__ === 'ios' ? 'iOS' : 'Android'

/** Where to turn the camera back on when the app cannot open the screen itself. */
export const cameraSettingsSteps =
  __PLATFORM__ === 'ios'
    ? 'Open Settings, then Apps, PepCalc, and turn on Camera.'
    : 'Open Android Settings, then Apps, PepCalc, Permissions, Camera.'
