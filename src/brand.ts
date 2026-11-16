/** What differs between the two apps in files they otherwise share. */
export const brand = {
  /** The wordmark's two halves, drawn in two tones by AppLogo and share cards. */
  wordmark: ['Pep', 'Calc'] as const,
  /** Health apps: what never leaves the app. */
  staysInApp: 'Draws, protocols, side effects, HbA1c and photos stay in PepCalc.',
  /** Primary action on a Today due card. */
  logDoseLabel: 'Log a draw',
  /** Singular noun for a dose or draw in shared copy. */
  doseNoun: 'draw',
  /** Source note under the side-effects summary card. */
  symptomSourceNote:
    'From the approved peptides’ label trials. Timing is from the last draw of any peptide.',
} as const
