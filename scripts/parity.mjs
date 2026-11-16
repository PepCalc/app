import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { compare, formatDiff, listFiles, neutralise, translateBrand } from './parity-lib.mjs'

const SUBCOMMANDS = new Set(['check', 'list', 'diff', 'port'])

function readManifest(repo) {
  return JSON.parse(readFileSync(resolve(repo, 'parity.json'), 'utf8'))
}

function resolveInside(root, relPath) {
  if (!relPath || isAbsolute(relPath)) {
    throw new Error(`Invalid relative path: ${relPath ?? '(missing)'}`)
  }
  const target = resolve(root, relPath)
  const boundary = root.endsWith(sep) ? root : root + sep
  if (!target.startsWith(boundary)) {
    throw new Error(`Path escapes repository root: ${relPath}`)
  }
  return target
}

function parseArgs(argv) {
  let args = argv.slice(2)
  // `npm run parity -- port <path>` appends after the script's default `check` argument.
  if (args[0] === 'check' && args.length > 1 && SUBCOMMANDS.has(args[1])) {
    args = args.slice(1)
  }
  const command = args[0] ?? 'check'
  const rest = args.slice(1)
  return { command, rest }
}

function runCheck(here, there, manifest, requireSibling) {
  if (!existsSync(there)) {
    console.log('Sibling not found; parity skipped.')
    return requireSibling ? 1 : 0
  }
  const result = compare(here, there, manifest)
  if (result.manifestMismatch) {
    console.error('parity.json roots or diverged entries do not match sibling.')
  }
  for (const item of result.drifted) {
    console.error(`drifted: ${item.path} (${item.changedLines} changed lines)`)
  }
  for (const file of result.staleDiverged) {
    console.error(`stale diverged entry: ${file}`)
  }
  for (const file of result.unsortedDiverged) {
    console.error(`unclassified diverged entry (Unsorted): ${file}`)
  }
  const failed =
    result.manifestMismatch ||
    result.drifted.length > 0 ||
    result.staleDiverged.length > 0 ||
    result.unsortedDiverged.length > 0
  if (failed) return 1
  console.log(
    `parity: ${result.shared.length} shared, ${result.diverged.length} diverged, 0 drifted`,
  )
  return 0
}

function runList(here, there, manifest) {
  if (!existsSync(there)) {
    console.error('Sibling not found.')
    return 1
  }
  const thereSet = new Set(listFiles(there, manifest.roots))
  const common = listFiles(here, manifest.roots).filter((file) => thereSet.has(file))
  for (const file of common) {
    if (Object.hasOwn(manifest.diverged, file)) {
      console.log(`diverged\t${file}\t${manifest.diverged[file]}`)
    } else {
      console.log(`shared\t${file}`)
    }
  }
  return 0
}

function runDiff(here, there, manifest, relPath) {
  if (!existsSync(there)) {
    console.error('Sibling not found.')
    return 1
  }
  const hereFile = resolveInside(here, relPath)
  const thereFile = resolveInside(there, relPath)
  if (!existsSync(hereFile) || !existsSync(thereFile)) {
    console.error(`File must exist in both repositories: ${relPath}`)
    return 1
  }
  const thereManifest = readManifest(there)
  const hereNeutral = neutralise(readFileSync(hereFile, 'utf8'), manifest.brand)
  const thereNeutral = neutralise(readFileSync(thereFile, 'utf8'), thereManifest.brand)
  if (hereNeutral === thereNeutral) {
    console.log(`No differences in ${relPath} after neutralising brand.`)
    return 0
  }
  console.log(formatDiff(relPath, hereNeutral, thereNeutral))
  return 0
}

function runPort(here, there, manifest, relPath) {
  if (!existsSync(there)) {
    console.error('Sibling not found.')
    return 1
  }
  if (Object.hasOwn(manifest.diverged, relPath)) {
    console.error(`Refusing to port diverged path: ${relPath}`)
    return 1
  }
  const hereFile = resolveInside(here, relPath)
  const thereFile = resolveInside(there, relPath)
  if (!existsSync(thereFile)) {
    console.error(`Missing in sibling: ${relPath}`)
    return 1
  }
  const thereManifest = readManifest(there)
  const translated = translateBrand(
    readFileSync(thereFile, 'utf8'),
    thereManifest.brand,
    manifest.brand,
  )
  mkdirSync(dirname(hereFile), { recursive: true })
  writeFileSync(hereFile, translated, 'utf8')
  console.log(`ported: ${relPath}`)
  return 0
}

const here = resolve(new URL('..', import.meta.url).pathname)
const manifest = readManifest(here)
const there = resolve(here, manifest.sibling)
const { command, rest } = parseArgs(process.argv)

let exitCode
if (command === 'check') {
  exitCode = runCheck(here, there, manifest, rest.includes('--require-sibling'))
} else if (command === 'list') {
  exitCode = runList(here, there, manifest)
} else if (command === 'diff') {
  exitCode = runDiff(here, there, manifest, rest[0])
} else if (command === 'port') {
  exitCode = runPort(here, there, manifest, rest[0])
} else {
  console.error(`Unknown command: ${command}`)
  exitCode = 1
}
process.exit(exitCode)
