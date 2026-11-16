import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('NotificationSettings plugin on iOS', () => {
  it('registers the plugin in MainViewController', () => {
    const controller = readFileSync('ios/App/App/MainViewController.swift', 'utf8')
    expect(controller).toContain('registerPluginInstance(NotificationSettingsPlugin())')
  })

  it('adds NotificationSettingsPlugin.swift to the Xcode project in all four places', () => {
    const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
    const matches = project.match(/NotificationSettingsPlugin\.swift/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(4)
  })

  it('declares jsName as NotificationSettings', () => {
    const plugin = readFileSync('ios/App/App/NotificationSettingsPlugin.swift', 'utf8')
    expect(plugin).toContain('public let jsName = "NotificationSettings"')
  })
})
