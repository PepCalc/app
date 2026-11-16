import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BINARY_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.keystore',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}

function isSkippedFile(relPath) {
  const dot = relPath.lastIndexOf('.')
  const ext = dot >= 0 ? relPath.slice(dot).toLowerCase() : ''
  if (BINARY_EXTENSIONS.has(ext)) return true
  if (relPath.startsWith('src/data/') && ext === '.json') return true
  return false
}

/**
 * Replaces one app's name, slug, env prefix and CSS prefix with neutral tokens, so only real
 * differences remain.
 */
export function neutralise(text, brand) {
  return text
    .replace(new RegExp(`--${escapeRegExp(brand.prefix)}-`, 'g'), '--app-')
    .replace(new RegExp(`\\b${escapeRegExp(brand.prefix)}-`, 'g'), 'app-')
    .replace(new RegExp(escapeRegExp(brand.env), 'g'), 'APPENV')
    .replace(new RegExp(escapeRegExp(brand.name), 'g'), 'AppName')
    .replace(new RegExp(escapeRegExp(brand.slug), 'g'), 'appslug')
}

/** Rewrites neutral text into an app's brand. The inverse of `neutralise`. */
export function brandAs(text, brand) {
  return text
    .replace(/--app-/g, `--${brand.prefix}-`)
    .replace(/\bapp-/g, `${brand.prefix}-`)
    .replace(/APPENV/g, brand.env)
    .replace(/AppName/g, brand.name)
    .replace(/appslug/g, brand.slug)
}

/**
 * Translates text directly from one brand to another in a single pass so pre-existing `app-*`
 * identifiers (such as `.app-logo` or `.app-snackbar`) are never rewritten.
 */
export function translateBrand(text, fromBrand, toBrand) {
  const pattern = new RegExp(
    `--${escapeRegExp(fromBrand.prefix)}-|\\b${escapeRegExp(fromBrand.prefix)}-|${escapeRegExp(fromBrand.env)}|${escapeRegExp(fromBrand.name)}|${escapeRegExp(fromBrand.slug)}`,
    'g',
  )
  const cssVarFrom = `--${fromBrand.prefix}-`
  const prefixFrom = `${fromBrand.prefix}-`
  return text.replace(pattern, (match) => {
    if (match === cssVarFrom) return `--${toBrand.prefix}-`
    if (match === prefixFrom) return `${toBrand.prefix}-`
    if (match === fromBrand.env) return toBrand.env
    if (match === fromBrand.name) return toBrand.name
    return toBrand.slug
  })
}

/** Every path under `roots` in `repo`, relative, sorted. Skips the catalog JSON and binaries. */
export function listFiles(repo, roots) {
  const files = new Set()
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        const rel = toPosix(relative(repo, full))
        if (!isSkippedFile(rel)) files.add(rel)
      }
    }
  }
  for (const root of roots) {
    const full = join(repo, root)
    if (!existsSync(full)) continue
    if (statSync(full).isDirectory()) {
      walk(full)
    } else {
      const rel = toPosix(relative(repo, full))
      if (!isSkippedFile(rel)) files.add(rel)
    }
  }
  return [...files].sort()
}

function lcsOps(aLines, bLines) {
  let start = 0
  while (start < aLines.length && start < bLines.length && aLines[start] === bLines[start]) {
    start++
  }
  let aEnd = aLines.length
  let bEnd = bLines.length
  while (aEnd > start && bEnd > start && aLines[aEnd - 1] === bLines[bEnd - 1]) {
    aEnd--
    bEnd--
  }
  const aMid = aLines.slice(start, aEnd)
  const bMid = bLines.slice(start, bEnd)
  const m = aMid.length
  const n = bMid.length
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aMid[i] === bMid[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  for (let k = 0; k < start; k++) ops.push({ type: 'same', line: aLines[k] })
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aMid[i] === bMid[j]) {
      ops.push({ type: 'same', line: aMid[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: aMid[i] })
      i++
    } else {
      ops.push({ type: 'add', line: bMid[j] })
      j++
    }
  }
  while (i < m) {
    ops.push({ type: 'del', line: aMid[i] })
    i++
  }
  while (j < n) {
    ops.push({ type: 'add', line: bMid[j] })
    j++
  }
  for (let k = aEnd; k < aLines.length; k++) ops.push({ type: 'same', line: aLines[k] })
  return ops
}

/** Counts deleted + added lines between two strings. */
export function countChangedLines(a, b) {
  if (a === b) return 0
  const ops = lcsOps(a.split('\n'), b.split('\n'))
  let changed = 0
  for (const op of ops) {
    if (op.type !== 'same') changed++
  }
  return changed
}

/** Formats a line-by-line diff between two neutralised texts. */
export function formatDiff(relPath, hereText, thereText) {
  const ops = lcsOps(hereText.split('\n'), thereText.split('\n'))
  const out = [`--- here/${relPath}`, `+++ sibling/${relPath}`]
  let hereLine = 0
  let thereLine = 0
  let idx = 0
  while (idx < ops.length) {
    if (ops[idx].type === 'same') {
      hereLine++
      thereLine++
      idx++
      continue
    }
    const hunkStart = Math.max(0, idx - 3)
    let end = idx
    let sameRun = 0
    while (end < ops.length) {
      if (ops[end].type === 'same') {
        sameRun++
        if (sameRun > 6) {
          end -= 3
          break
        }
      } else {
        sameRun = 0
      }
      end++
    }
    out.push(`@@ -${hereLine + 1} +${thereLine + 1} @@`)
    for (let k = hunkStart; k < end; k++) {
      const op = ops[k]
      if (op.type === 'same') out.push(` ${op.line}`)
      else if (op.type === 'del') out.push(`-${op.line}`)
      else out.push(`+${op.line}`)
    }
    while (idx < end) {
      if (ops[idx].type !== 'add') hereLine++
      if (ops[idx].type !== 'del') thereLine++
      idx++
    }
  }
  return out.join('\n')
}

function sameManifestRules(a, b) {
  if (!b || !Array.isArray(b.roots) || !b.diverged || typeof b.diverged !== 'object') {
    return false
  }
  if (a.roots.length !== b.roots.length) return false
  for (let i = 0; i < a.roots.length; i++) {
    if (a.roots[i] !== b.roots[i]) return false
  }
  const aKeys = Object.keys(a.diverged).sort()
  const bKeys = Object.keys(b.diverged).sort()
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i]
    if (key !== bKeys[i]) return false
    if (a.diverged[key] !== b.diverged[key]) return false
  }
  return true
}

/** Compares two repositories by a manifest. */
export function compare(here, there, manifest) {
  const thereManifestPath = join(there, 'parity.json')
  const thereManifest = existsSync(thereManifestPath)
    ? JSON.parse(readFileSync(thereManifestPath, 'utf8'))
    : null
  const manifestMismatch = !sameManifestRules(manifest, thereManifest)
  const thereBrand = thereManifest?.brand ?? manifest.brand

  const hereFiles = new Set(listFiles(here, manifest.roots))
  const thereFiles = new Set(listFiles(there, manifest.roots))
  const common = [...hereFiles].filter((file) => thereFiles.has(file)).sort()
  const commonSet = new Set(common)

  const shared = []
  const drifted = []
  const diverged = []
  const staleDiverged = []
  const unsortedDiverged = []

  for (const file of common) {
    const hereText = neutralise(readFileSync(join(here, file), 'utf8'), manifest.brand)
    const thereText = neutralise(readFileSync(join(there, file), 'utf8'), thereBrand)
    const identical = hereText === thereText

    if (Object.hasOwn(manifest.diverged, file)) {
      diverged.push(file)
      const reason = manifest.diverged[file]
      if (typeof reason !== 'string' || reason.trim() === '' || reason.trim() === 'Unsorted') {
        unsortedDiverged.push(file)
      }
      if (identical) staleDiverged.push(file)
    } else {
      shared.push(file)
      if (!identical) {
        drifted.push({ path: file, changedLines: countChangedLines(hereText, thereText) })
      }
    }
  }

  for (const file of Object.keys(manifest.diverged)) {
    if (!commonSet.has(file)) staleDiverged.push(file)
  }

  return {
    shared,
    drifted,
    diverged,
    staleDiverged: staleDiverged.sort(),
    unsortedDiverged: unsortedDiverged.sort(),
    manifestMismatch,
  }
}
