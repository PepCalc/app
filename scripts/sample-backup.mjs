/*
 * A made-up shelf, never real records, as a PepCalc backup file: semaglutide drawn weekly from a
 * finished vial and then a fresh one after a step-up, a BPC-157 vial drawn daily, and weekly
 * weigh-ins. Every vial in use is inside its 28-day limit. The store screenshot script
 * restores it through Settings, the same path a user takes. Dates are relative to now.
 */
const DAY = 86_400_000
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
/** A local time of day `daysAgo` days back, so entries read like a real routine. */
const at = (daysAgo, hour) => {
  const d = new Date(now - daysAgo * DAY)
  d.setHours(hour, 7, 0, 0)
  return d.getTime()
}
const created = iso(now - 60 * DAY)

function vial(id, peptideId, name, amount, diluentMl, reconstitutedDaysAgo, status = 'active') {
  return {
    id,
    peptideId,
    name,
    kind: 'single',
    unit: 'mg',
    amount,
    diluentMl,
    components: null,
    typicalDose: null,
    pkOverride: null,
    reconstitutedAt: iso(at(reconstitutedDaysAgo, 9)),
    status,
    notes: '',
    createdAt: created,
    updatedAt: created,
  }
}

/** A draw of `value` `unit` from a vial at `mgPerMl`, read on a U-100 1 mL syringe. */
function draw(id, vialId, daysAgo, value, unit, mgPerMl) {
  const mg = unit === 'mcg' ? value / 1000 : value
  return {
    id,
    vialId,
    takenAt: iso(at(daysAgo, 19)),
    dose: { value, unit },
    volumeMl: mg / mgPerMl,
    syringeId: 'u100-1ml',
    notes: '',
    createdAt: iso(at(daysAgo, 19)),
  }
}

export function sampleBackup() {
  // 5 mg in 2 mL and 10 mg in 2 mL: 2.5 and 5 mg/mL.
  const vials = [
    vial('sema1', 'semaglutide', 'Semaglutide', 5, 2, 54, 'archived'),
    vial('sema2', 'semaglutide', 'Semaglutide', 5, 2, 19),
    vial('bpc', 'bpc-157', 'BPC-157', 10, 2, 14),
  ]
  const draws = [
    ...Array.from({ length: 8 }, (_, w) =>
      w < 5
        ? draw(`s${w}`, 'sema1', 53 - w * 7, 0.25, 'mg', 2.5)
        : draw(`s${w}`, 'sema2', 53 - w * 7, 0.5, 'mg', 2.5),
    ),
    ...Array.from({ length: 14 }, (_, d) => draw(`b${d}`, 'bpc', 14 - d, 250, 'mcg', 5)),
  ]
  const measurements = Array.from({ length: 8 }, (_, w) => ({
    id: `w${w}`,
    metric: 'weight',
    measuredAt: iso(at(53 - w * 7, 7)),
    value: Math.round((96.4 - w * 0.6 - (w % 3 === 1 ? 0.2 : 0)) * 10) / 10,
    enteredUnit: 'kg',
    notes: '',
    createdAt: created,
  }))
  return {
    format: 'pepcalc-backup',
    version: 3,
    exportedAt: iso(now),
    vials,
    draws,
    measurements,
    symptoms: [],
    glucose: [],
    photos: [],
    // Restore replaces settings too: keep the notice accepted and the install hint away.
    settings: [
      { key: 'disclaimerAcceptedAt', value: iso(now) },
      { key: 'installHintDismissed', value: true },
      { key: 'lastBackupAt', value: iso(now) },
    ],
  }
}
