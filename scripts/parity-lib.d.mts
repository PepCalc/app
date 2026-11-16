export interface ParityBrand {
  name: string
  slug: string
  env: string
  prefix: string
}

export interface ParityManifest {
  sibling: string
  brand: ParityBrand
  roots: string[]
  diverged: Record<string, string>
}

export interface ParityDrift {
  path: string
  changedLines: number
}

export interface ParityResult {
  shared: string[]
  drifted: ParityDrift[]
  diverged: string[]
  staleDiverged: string[]
  unsortedDiverged: string[]
  manifestMismatch: boolean
}

export function neutralise(text: string, brand: ParityBrand): string
export function brandAs(text: string, brand: ParityBrand): string
export function translateBrand(text: string, fromBrand: ParityBrand, toBrand: ParityBrand): string
export function listFiles(repo: string, roots: string[]): string[]
export function countChangedLines(a: string, b: string): number
export function formatDiff(relPath: string, hereText: string, thereText: string): string
export function compare(here: string, there: string, manifest: ParityManifest): ParityResult
