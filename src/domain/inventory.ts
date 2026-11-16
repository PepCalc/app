import { convert, type AmountUnit, type Quantity } from './units'
import { vialAgeText, type AgeLimits, type AgeTier } from './vialAge'

export interface VialContents {
  amount: number
  unit: AmountUnit
  diluentMl: number
}

export interface DrawRecord {
  dose: Quantity
  volumeMl: number
}

export interface VialBalance {
  /** Peptide left, in the vial's unit; never below zero. */
  remainingAmount: number
  remainingMl: number
  usedFraction: number
  /** Whole doses left at `typicalDose`, or null when no dose is known. */
  dosesLeft: number | null
  overdrawn: boolean
}

/**
 * Remaining peptide and liquid after the logged draws. Volume is tracked from the recorded
 * draw volumes rather than recomputed, so a later edit of the vial's water volume does not
 * silently rewrite history.
 */
export function vialBalance(
  vial: VialContents,
  draws: readonly DrawRecord[],
  typicalDose?: Quantity,
): VialBalance {
  const used = draws.reduce((sum, d) => sum + convert(d.dose, vial.unit).value, 0)
  const usedMl = draws.reduce((sum, d) => sum + d.volumeMl, 0)
  const remainingAmount = Math.max(0, vial.amount - used)
  const remainingMl = Math.max(0, vial.diluentMl - usedMl)
  const typical = typicalDose ? convert(typicalDose, vial.unit).value : 0
  return {
    remainingAmount,
    remainingMl,
    usedFraction: vial.amount > 0 ? Math.min(1, used / vial.amount) : 0,
    dosesLeft: typical > 0 ? Math.floor(remainingAmount / typical + 1e-9) : null,
    overdrawn: used > vial.amount + 1e-9,
  }
}

export interface ShelfNoticeVial {
  id: string
  name: string
  status: 'active' | 'archived'
}

export interface ShelfNoticeAge {
  days: number
  tier: AgeTier
  limits: AgeLimits
}

export interface ShelfNotice {
  id: string
  vialId: string
  kind: 'low' | 'age' | 'overdrawn'
  text: string
  tone: 'notice' | 'alert'
}

/**
 * Active vials that need attention (low supply, nearing or past use limit, or overdrawn),
 * sorted by vial name.
 */
export function shelfNotices(
  vials: readonly ShelfNoticeVial[],
  balances: ReadonlyMap<string, VialBalance>,
  ages: ReadonlyMap<string, ShelfNoticeAge | null>,
): ShelfNotice[] {
  const active = vials
    .filter((v) => v.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))
  const notices: ShelfNotice[] = []
  for (const vial of active) {
    const balance = balances.get(vial.id)
    if (balance?.overdrawn) {
      notices.push({
        id: `${vial.id}:overdrawn`,
        vialId: vial.id,
        kind: 'overdrawn',
        text: `${vial.name}: draws exceed the vial.`,
        tone: 'alert',
      })
    } else if (balance && balance.dosesLeft !== null && balance.dosesLeft <= 2) {
      const noun = balance.dosesLeft === 1 ? 'dose' : 'doses'
      notices.push({
        id: `${vial.id}:low`,
        vialId: vial.id,
        kind: 'low',
        text: `${vial.name}: about ${balance.dosesLeft} ${noun} left.`,
        tone: 'notice',
      })
    }
    const age = ages.get(vial.id)
    if (age && (age.tier === 'nearing' || age.tier === 'past')) {
      notices.push({
        id: `${vial.id}:age`,
        vialId: vial.id,
        kind: 'age',
        text: `${vial.name}: ${vialAgeText(age)}`,
        tone: age.tier === 'past' ? 'alert' : 'notice',
      })
    }
  }
  return notices
}
