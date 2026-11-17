import { describe, expect, it } from 'vitest'
import {
  INJECTION_SITES,
  SITE_LABELS,
  isValidInjectionSite,
  isValidSiteMode,
  nextRotationSite,
  suggestedSiteFor,
} from '@/domain/sites'

describe('sites', () => {
  it('includes Gliplog sites plus glute-left and glute-right with labels', () => {
    expect(INJECTION_SITES).toEqual([
      'abdomen-left',
      'abdomen-right',
      'thigh-left',
      'thigh-right',
      'arm-left',
      'arm-right',
      'glute-left',
      'glute-right',
    ])
    for (const site of INJECTION_SITES) {
      expect(SITE_LABELS[site]).toBeTruthy()
      expect(isValidInjectionSite(site)).toBe(true)
    }
    expect(isValidInjectionSite('other')).toBe(false)
    expect(isValidSiteMode('rotate')).toBe(true)
    expect(isValidSiteMode('fixed')).toBe(true)
    expect(isValidSiteMode('other')).toBe(false)
  })

  it('rotates through all sites and wraps around from glute-right to abdomen-left', () => {
    expect(nextRotationSite('abdomen-left')).toBe('abdomen-right')
    expect(nextRotationSite('arm-right')).toBe('glute-left')
    expect(nextRotationSite('glute-left')).toBe('glute-right')
    expect(nextRotationSite('glute-right')).toBe('abdomen-left')
  })

  it('prefills fixed site when protocol is fixed', () => {
    expect(suggestedSiteFor({ site: 'glute-left', siteMode: 'fixed' }, 'abdomen-left')).toEqual({
      prefill: 'glute-left',
      nextInRotation: null,
    })
  })

  it('starts rotation from protocol site before any draw, then advances from last draw', () => {
    expect(suggestedSiteFor({ site: 'glute-left', siteMode: 'rotate' }, null)).toEqual({
      prefill: 'glute-left',
      nextInRotation: 'glute-left',
    })
    expect(suggestedSiteFor({ site: 'glute-left', siteMode: 'rotate' }, 'glute-left')).toEqual({
      prefill: 'glute-right',
      nextInRotation: 'glute-right',
    })
  })

  it('leaves prefill null when protocol has no site, while still hinting rotation from last draw', () => {
    expect(suggestedSiteFor(undefined, null)).toEqual({
      prefill: null,
      nextInRotation: null,
    })
    expect(suggestedSiteFor({ site: null, siteMode: null }, 'thigh-right')).toEqual({
      prefill: null,
      nextInRotation: 'arm-left',
    })
  })
})
