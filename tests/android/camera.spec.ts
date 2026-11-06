import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest runs from the repository root.
const read = (path: string) => readFileSync(join('android/app/src/main', path), 'utf8')

/*
 * Capacitor opens the system camera for <input capture>, and quietly falls back to the gallery if
 * either check below fails. Nothing else in the suite runs on a phone, so these pin the config.
 */
describe('Take a photo on Android', () => {
  const manifest = read('AndroidManifest.xml')

  it('can see the camera app, which Android 11 and later hide by default', () => {
    expect(manifest).toMatch(
      /<queries>[\s\S]*android\.media\.action\.IMAGE_CAPTURE[\s\S]*<\/queries>/,
    )
  })

  it('shares the folder the capture is written to', () => {
    expect(read('res/xml/file_paths.xml')).toMatch(/<external-files-path[^>]*path="Pictures\/"/)
  })

  it('declares the permission it asks for, or asking would fail', () => {
    expect(manifest).toContain('<uses-permission android:name="android.permission.CAMERA" />')
  })

  it('stays installable on devices without a camera', () => {
    for (const feature of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
      expect(manifest).toContain(`<uses-feature android:name="${feature}" android:required="false" />`)
    }
  })

  it('registers the plugin that reports access', () => {
    const activity = readFileSync(
      join('android/app/src/main/java/io/github/pepcalc/app/MainActivity.java'),
      'utf8',
    )
    expect(activity).toContain('registerPlugin(CameraAccessPlugin.class)')
  })
})

describe('Take a photo on iOS', () => {
  it('says why it needs the camera, or iOS ends the app at the prompt', () => {
    expect(readFileSync('ios/App/App/Info.plist', 'utf8')).toContain('NSCameraUsageDescription')
  })

  it('builds and registers the plugin that reports access', () => {
    const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
    expect(project).toContain('CameraAccessPlugin.swift in Sources')
    expect(project).toContain('MainViewController.swift in Sources')
    expect(readFileSync('ios/App/App/MainViewController.swift', 'utf8')).toContain(
      'registerPluginInstance(CameraAccessPlugin())',
    )
    expect(readFileSync('ios/App/App/Base.lproj/Main.storyboard', 'utf8')).toContain(
      'customClass="MainViewController"',
    )
  })
})
