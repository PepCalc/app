// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  brandAs,
  compare,
  listFiles,
  neutralise,
  type ParityBrand,
  type ParityManifest,
} from '../../scripts/parity-lib.mjs'

const BRAND_A: ParityBrand = {
  name: 'AlphaLog',
  slug: 'alphalog',
  env: 'ALPHALOG',
  prefix: 'al',
}

const BRAND_B: ParityBrand = {
  name: 'BetaCalc',
  slug: 'betacalc',
  env: 'BETACALC',
  prefix: 'bc',
}

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'parity-test-'))
  tempDirs.push(dir)
  return dir
}

function writeRepoFile(repo: string, relPath: string, content: string): void {
  const full = join(repo, relPath)
  mkdirSync(resolve(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
}

function makeManifest(
  sibling: string,
  brand: ParityBrand,
  diverged: Record<string, string> = {},
): ParityManifest {
  return {
    sibling,
    brand,
    roots: ['src', 'tests'],
    diverged,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('neutralise and brandAs', () => {
  it('replaces brand tokens in order', () => {
    const input = 'var(--al-x) class="al-stack" AlphaLog alphalog ALPHALOG_BASE'
    expect(neutralise(input, BRAND_A)).toBe(
      'var(--app-x) class="app-stack" AppName appslug APPENV_BASE',
    )
  })

  it('leaves words ending in the prefix before a hyphen unchanged', () => {
    expect(neutralise('normal-line oval-shape', BRAND_A)).toBe('normal-line oval-shape')
  })

  it('round-trips real source files', () => {
    const repoRoot = resolve(import.meta.dirname, '../..')
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'parity.json'), 'utf8'),
    ) as ParityManifest
    const sample = [
      'src/stores/healthSync.ts',
      'src/views/HealthView.vue',
      'src/components/common/SortToggle.vue',
      'src/domain/body.ts',
      'vitest.config.ts',
    ]
    for (const relPath of sample) {
      const text = readFileSync(join(repoRoot, relPath), 'utf8')
      expect(brandAs(neutralise(text, manifest.brand), manifest.brand)).toBe(text)
    }
  })
})

describe('listFiles', () => {
  it('returns sorted relative paths skipping catalog JSON and binaries', () => {
    const repo = makeTempDir()
    writeRepoFile(repo, 'src/z.ts', 'export const z = 1\n')
    writeRepoFile(repo, 'src/a.ts', 'export const a = 1\n')
    writeRepoFile(repo, 'src/data/medications.json', '{}')
    writeRepoFile(repo, 'src/assets/photo.webp', 'binary')
    writeRepoFile(repo, 'tests/a.spec.ts', 'test\n')
    expect(listFiles(repo, ['src', 'tests', 'missing-root'])).toEqual([
      'src/a.ts',
      'src/z.ts',
      'tests/a.spec.ts',
    ])
  })
})

describe('compare and parity CLI', () => {
  it('reports zero drift when fixtures differ only by brand', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../b', BRAND_A)))
    writeRepoFile(there, 'parity.json', JSON.stringify(makeManifest('../a', BRAND_B)))
    writeRepoFile(here, 'src/card.css', '.al-card { color: var(--al-text); }\n')
    writeRepoFile(there, 'src/card.css', '.bc-card { color: var(--bc-text); }\n')

    const result = compare(here, there, makeManifest('../b', BRAND_A))
    expect(result).toEqual({
      shared: ['src/card.css'],
      drifted: [],
      diverged: [],
      staleDiverged: [],
      unsortedDiverged: [],
      manifestMismatch: false,
    })
  })

  it('reports drift with changedLines: 2 when one line changes in a shared file', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../b', BRAND_A)))
    writeRepoFile(there, 'parity.json', JSON.stringify(makeManifest('../a', BRAND_B)))
    writeRepoFile(here, 'src/a.ts', 'line 1\nline 2\nline 3\n')
    writeRepoFile(there, 'src/a.ts', 'line 1\nline TWO\nline 3\n')

    const result = compare(here, there, makeManifest('../b', BRAND_A))
    expect(result.drifted).toEqual([{ path: 'src/a.ts', changedLines: 2 }])
  })

  it('flags a diverged entry that is identical as stale and exits 1', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    const diverged = { 'src/a.ts': 'Different behaviour.' }
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../b', BRAND_A, diverged)))
    writeRepoFile(there, 'parity.json', JSON.stringify(makeManifest('../a', BRAND_B, diverged)))
    writeRepoFile(here, 'src/a.ts', 'same\n')
    writeRepoFile(there, 'src/a.ts', 'same\n')
    writeRepoFile(
      here,
      'scripts/parity-lib.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity-lib.mjs'), 'utf8'),
    )
    writeRepoFile(
      here,
      'scripts/parity.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity.mjs'), 'utf8'),
    )

    const result = compare(here, there, makeManifest('../b', BRAND_A, diverged))
    expect(result.staleDiverged).toEqual(['src/a.ts'])

    const cli = spawnSync(process.execPath, ['scripts/parity.mjs', 'check'], {
      cwd: here,
      encoding: 'utf8',
    })
    expect(cli.status).toBe(1)
    expect(cli.stderr).toContain('stale diverged entry: src/a.ts')
  })

  it('rejects a diverged path with reason Unsorted and exits 1', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    const diverged = { 'src/a.ts': 'Unsorted' }
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../b', BRAND_A, diverged)))
    writeRepoFile(there, 'parity.json', JSON.stringify(makeManifest('../a', BRAND_B, diverged)))
    writeRepoFile(here, 'src/a.ts', 'one\n')
    writeRepoFile(there, 'src/a.ts', 'two\n')
    writeRepoFile(
      here,
      'scripts/parity-lib.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity-lib.mjs'), 'utf8'),
    )
    writeRepoFile(
      here,
      'scripts/parity.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity.mjs'), 'utf8'),
    )

    const result = compare(here, there, makeManifest('../b', BRAND_A, diverged))
    expect(result.unsortedDiverged).toEqual(['src/a.ts'])

    const cli = spawnSync(process.execPath, ['scripts/parity.mjs', 'check'], {
      cwd: here,
      encoding: 'utf8',
    })
    expect(cli.status).toBe(1)
    expect(cli.stderr).toContain('Unsorted')
  })

  it('reports manifestMismatch and exits 1 when roots or diverged differ', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    writeRepoFile(
      here,
      'parity.json',
      JSON.stringify(makeManifest('../b', BRAND_A, { 'src/a.ts': 'Reason A' })),
    )
    writeRepoFile(
      there,
      'parity.json',
      JSON.stringify(makeManifest('../a', BRAND_B, { 'src/a.ts': 'Reason B' })),
    )
    writeRepoFile(here, 'src/a.ts', 'one\n')
    writeRepoFile(there, 'src/a.ts', 'two\n')
    writeRepoFile(
      here,
      'scripts/parity-lib.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity-lib.mjs'), 'utf8'),
    )
    writeRepoFile(
      here,
      'scripts/parity.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity.mjs'), 'utf8'),
    )

    const result = compare(here, there, makeManifest('../b', BRAND_A, { 'src/a.ts': 'Reason A' }))
    expect(result.manifestMismatch).toBe(true)

    const cli = spawnSync(process.execPath, ['scripts/parity.mjs', 'check'], {
      cwd: here,
      encoding: 'utf8',
    })
    expect(cli.status).toBe(1)
  })

  it('skips when sibling is missing unless --require-sibling is passed', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../missing', BRAND_A)))
    writeRepoFile(
      here,
      'scripts/parity-lib.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity-lib.mjs'), 'utf8'),
    )
    writeRepoFile(
      here,
      'scripts/parity.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity.mjs'), 'utf8'),
    )

    const optional = spawnSync(process.execPath, ['scripts/parity.mjs', 'check'], {
      cwd: here,
      encoding: 'utf8',
    })
    expect(optional.status).toBe(0)
    expect(optional.stdout).toContain('Sibling not found; parity skipped.')

    const required = spawnSync(
      process.execPath,
      ['scripts/parity.mjs', 'check', '--require-sibling'],
      { cwd: here, encoding: 'utf8' },
    )
    expect(required.status).toBe(1)
  })

  it('ports a shared file into this brand while preserving app-* identifiers', () => {
    const root = makeTempDir()
    const here = join(root, 'a')
    const there = join(root, 'b')
    writeRepoFile(here, 'parity.json', JSON.stringify(makeManifest('../b', BRAND_A)))
    writeRepoFile(there, 'parity.json', JSON.stringify(makeManifest('../a', BRAND_B)))
    writeRepoFile(
      there,
      'src/AppLogo.vue',
      '<div class="app-logo bc-stack" style="color: var(--bc-brand)">BetaCalc betacalc BETACALC</div>\n',
    )
    writeRepoFile(
      here,
      'scripts/parity-lib.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity-lib.mjs'), 'utf8'),
    )
    writeRepoFile(
      here,
      'scripts/parity.mjs',
      readFileSync(resolve(import.meta.dirname, '../../scripts/parity.mjs'), 'utf8'),
    )

    const cli = spawnSync(
      process.execPath,
      ['scripts/parity.mjs', 'check', 'port', 'src/AppLogo.vue'],
      {
        cwd: here,
        encoding: 'utf8',
      },
    )
    expect(cli.status).toBe(0)
    expect(readFileSync(join(here, 'src/AppLogo.vue'), 'utf8')).toBe(
      '<div class="app-logo al-stack" style="color: var(--al-brand)">AlphaLog alphalog ALPHALOG</div>\n',
    )
  })
})
