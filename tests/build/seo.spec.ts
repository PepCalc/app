import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IndexHtmlTransformResult, Plugin } from 'vite'
import {
  catalogPeptides,
  DESCRIPTION,
  headTags,
  seo,
  shellHtml,
  structuredData,
} from '../../build/seo'

const peptides = catalogPeptides(resolve('src/data/peptides.json'))
const options = { appUrl: 'https://pepcalc.github.io/app/', version: '1.2.3', peptides }
const INDEX = readFileSync(resolve('index.html'), 'utf8')

function transform(plugin: Plugin, html: string) {
  const hook = plugin.transformIndexHtml as (html: string) => IndexHtmlTransformResult
  return hook(html)
}

describe('seo plugin', () => {
  it('writes a readable page into #app with every catalog peptide', () => {
    const shell = shellHtml(options)
    expect(shell).toMatch(/^<main class="pc-shell"><h1>/)
    for (const name of peptides) expect(shell).toContain(name)
    expect(shell).toMatch(/never recommends a dose/)
  })

  it('fills #app and adds the head tags in a web build', () => {
    const result = transform(seo({ ...options, enabled: true }), INDEX) as {
      html: string
      tags: { attrs?: Record<string, string> }[]
    }
    expect(result.html).toContain('<div id="app"><main class="pc-shell">')
    const canonical = result.tags.find((t) => t.attrs?.rel === 'canonical')
    expect(canonical?.attrs?.href).toBe('https://pepcalc.github.io/app/')
    const og = Object.fromEntries(
      result.tags
        .filter((t) => t.attrs?.property)
        .map((t) => [t.attrs!.property, t.attrs!.content]),
    )
    expect(og['og:url']).toBe('https://pepcalc.github.io/app/')
    expect(og['og:image']).toBe('https://pepcalc.github.io/app/og.png')
  })

  it('leaves the Android bundle alone', () => {
    expect(transform(seo({ ...options, enabled: false }), INDEX)).toBe(INDEX)
  })

  it('describes the app the same way in index.html and the share tags', () => {
    expect(INDEX.replace(/\s+/g, ' ')).toContain(`content="${DESCRIPTION}"`)
  })

  it('emits a WebApplication record that parses and cannot close its script tag', () => {
    const tag = headTags(options).find((t) => t.attrs?.type === 'application/ld+json')!
    const json = tag.children as string
    expect(json).not.toContain('<')
    const data = JSON.parse(json) as ReturnType<typeof structuredData>
    expect(data['@type']).toBe('WebApplication')
    expect(data.url).toBe('https://pepcalc.github.io/app/')
    expect(data.isAccessibleForFree).toBe(true)
  })
})
