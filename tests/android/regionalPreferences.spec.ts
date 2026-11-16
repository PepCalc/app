import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('RegionalPreferences plugin on Android', () => {
  const pkg = 'android/app/src/main/java/io/github/pepcalc/app'

  it('registers the plugin in MainActivity before super.onCreate', () => {
    const activity = readFileSync(join(pkg, 'MainActivity.java'), 'utf8')
    expect(activity).toContain('registerPlugin(RegionalPreferencesPlugin.class)')
  })

  it('declares the CapacitorPlugin name', () => {
    const plugin = readFileSync(join(pkg, 'RegionalPreferencesPlugin.java'), 'utf8')
    expect(plugin).toContain('@CapacitorPlugin(name = "RegionalPreferences")')
  })
})
