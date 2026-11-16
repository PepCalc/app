/** What differs between the two apps in files they otherwise share. */
export const brand = {
  /** The wordmark's two halves, drawn in two tones by AppLogo and share cards. */
  wordmark: ['Pep', 'Calc'] as const,
  /** Health apps: what never leaves the app. */
  staysInApp: 'Draws, protocols, side effects, HbA1c and photos stay in PepCalc.',
  /** Primary action on a Today due card. */
  logDoseLabel: 'Log a draw',
} as const
