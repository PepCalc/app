import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join('android/app/src/main', path), 'utf8')

describe('Dose reminders on Android', () => {
  const manifest = read('AndroidManifest.xml')

  it('removes SCHEDULE_EXACT_ALARM and never declares INTERNET', () => {
    expect(manifest).toContain(
      '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />',
    )
    expect(manifest).toContain(
      '<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />',
    )
    expect(manifest).not.toMatch(/android\.permission\.INTERNET" \/>/)
  })

  it('registers NotificationSettingsPlugin in MainActivity before super.onCreate', () => {
    const activity = read('java/io/github/pepcalc/app/MainActivity.java')
    expect(activity).toContain('registerPlugin(NotificationSettingsPlugin.class)')
    const plugin = read('java/io/github/pepcalc/app/NotificationSettingsPlugin.java')
    expect(plugin).toContain('@CapacitorPlugin(name = "NotificationSettings")')
  })

  it('names an existing status bar icon in capacitor.config.ts', () => {
    const config = readFileSync('capacitor.config.ts', 'utf8')
    const match = config.match(/smallIcon:\s*'([^']+)'/)
    expect(match).not.toBeNull()
    const iconName = match![1]!
    expect(existsSync(join('android/app/src/main/res/drawable', `${iconName}.xml`))).toBe(true)
  })
})
