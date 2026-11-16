import type { AmountUnit } from './units'
import type { BlendComponent } from './blend'
import type { PkParameters } from './pk'
import type { SyringeSpec } from './syringe'

/**
 * Where a number came from. `label` is a regulator-approved prescribing label, `trial` a
 * published clinical trial or review of trials, `standard` a pharmacopeia, accreditation or
 * public-health standard (USP, the WHO BMI bands), `preclinical` animal or in-vitro work, `community` vendor listings or user
 * forums (shown with a caution), `model` an assumption made by pepcalc where sources give only a
 * range.
 */
export type SourceKind = 'label' | 'trial' | 'standard' | 'preclinical' | 'community' | 'model'

/** How each kind of source is named wherever a figure is shown or shared. */
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  label: 'Prescribing label',
  trial: 'Clinical trial',
  standard: 'Published standard',
  preclinical: 'Animal data',
  community: 'Community-reported',
  model: 'Derived',
}

export interface SourceRef {
  kind: SourceKind
  citation: string
  url?: string
}

interface PresetList {
  values: number[]
  unit: AmountUnit
  source: SourceRef
}

interface CatalogPk extends PkParameters {
  /** Ranges or caveats from the source, shown beside the chart. */
  notes: string
  sources: SourceRef[]
}

/** How injections of a peptide are reported to feel, and the strength users find tolerable. */
export interface InjectionSiteNote {
  note: string
  /** Concentration at or below which users report injections as tolerable; mass vials only. */
  maxMgPerMl?: number
  sources: SourceRef[]
}

/** How long a mixed vial may be used, with the reason and where the limit comes from. */
export interface InUseLimit {
  days: number
  note: string
  sources: SourceRef[]
}

/** Catalog-wide storage guidance for mixed vials; a peptide's own `inUse` may only shorten it. */
interface StorageGuidance {
  inUse: InUseLimit
  /** How to keep a mixed vial (temperature, light, freezing), shown on the vial page. */
  advice: string
  adviceSources: SourceRef[]
}

export interface CatalogPeptide {
  id: string
  name: string
  aliases: string[]
  kind: 'single' | 'blend'
  summary: string
  /** Unit the vial's contents are labelled in. */
  vialUnit: AmountUnit
  /** Unit a dose is usually written in; must be compatible with vialUnit. */
  defaultDoseUnit: AmountUnit
  vialSizes: PresetList
  diluentMl: { values: number[]; source: SourceRef }
  doses: PresetList | null
  /** Blend contents per vial; required when kind is 'blend'. */
  components?: BlendComponent[]
  injectionSite?: InjectionSiteNote
  /** A shorter in-use limit than the catalog default, from this peptide's own label. */
  inUse?: InUseLimit
  /** Human pharmacokinetics, or null when no reliable human data exists. */
  pk: CatalogPk | null
  /** Shown when pk is null: what is (and is not) known. */
  pkUnavailableReason?: string
}

export interface Catalog {
  version: number
  storage: StorageGuidance
  peptides: CatalogPeptide[]
}

export interface SyringeCatalog {
  version: number
  defaultSyringeId: string
  syringes: SyringeSpec[]
}
