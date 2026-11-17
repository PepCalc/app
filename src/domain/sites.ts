/** Supported injection sites across PepCalc (Gliplog's sites plus glutes left and right). */
export const INJECTION_SITES = [
  'abdomen-left',
  'abdomen-right',
  'thigh-left',
  'thigh-right',
  'arm-left',
  'arm-right',
  'glute-left',
  'glute-right',
] as const

export type InjectionSite = (typeof INJECTION_SITES)[number]

const SITE_MODES = ['rotate', 'fixed'] as const
export type SiteMode = (typeof SITE_MODES)[number]

/** Plain words for each injection site, shared by protocols, draws and the history list. */
export const SITE_LABELS: Record<InjectionSite, string> = {
  'abdomen-left': 'Belly, left',
  'abdomen-right': 'Belly, right',
  'thigh-left': 'Thigh, left',
  'thigh-right': 'Thigh, right',
  'arm-left': 'Arm, left',
  'arm-right': 'Arm, right',
  'glute-left': 'Glute, left',
  'glute-right': 'Glute, right',
}

export function isValidInjectionSite(value: unknown): value is InjectionSite {
  return typeof value === 'string' && INJECTION_SITES.includes(value as InjectionSite)
}

export function isValidSiteMode(value: unknown): value is SiteMode {
  return typeof value === 'string' && SITE_MODES.includes(value as SiteMode)
}

/** The site that follows `lastSite` in rotation order, wrapping around at the end. */
export function nextRotationSite(lastSite: InjectionSite): InjectionSite {
  const index = INJECTION_SITES.indexOf(lastSite)
  return INJECTION_SITES[(index + 1) % INJECTION_SITES.length]!
}

export interface SiteSuggestion {
  /** Site to pre-select on a new draw, or null when the protocol has no site preference. */
  prefill: InjectionSite | null
  /** Next site in rotation to show as a hint, or null when fixed or no site history exists. */
  nextInRotation: InjectionSite | null
}

/**
 * Picks the suggested injection site for a new draw from the peptide's protocol setting and the
 * last logged draw site. Fixed protocols always prefill the configured site; rotating protocols
 * start from the configured site and advance from the last logged draw; unconfigured protocols
 * leave prefill null while still suggesting the next rotation site after a previous draw.
 */
export function suggestedSiteFor(
  protocol: { site: InjectionSite | null; siteMode: SiteMode | null } | undefined,
  lastDrawSite: InjectionSite | null,
): SiteSuggestion {
  if (protocol?.site) {
    if (protocol.siteMode === 'fixed') {
      return { prefill: protocol.site, nextInRotation: null }
    }
    const next = lastDrawSite ? nextRotationSite(lastDrawSite) : protocol.site
    return { prefill: next, nextInRotation: next }
  }
  return {
    prefill: null,
    nextInRotation: lastDrawSite ? nextRotationSite(lastDrawSite) : null,
  }
}
