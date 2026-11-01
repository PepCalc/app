import { readFileSync } from 'node:fs'
import type { HtmlTagDescriptor, Plugin } from 'vite'

/*
 * What search engines and AI assistants can read about PepCalc. The app is a single page that
 * renders in JavaScript, and many crawlers (most AI ones included) never run it, so the build
 * writes a plain description of the app into #app, which Vue replaces when it mounts, plus the
 * head tags link previews read and a WebApplication record. The text is the same for people and
 * crawlers; it is visible until the app starts. robots.txt, sitemap.xml and llms.txt belong at
 * the origin root, so the website repository (PepCalc/pepcalc.github.io) publishes them.
 */

export interface SeoOptions {
  /** Absolute URL the app is served at, ending in "/". */
  appUrl: string
  version: string
  /** Peptide names from the catalog, so the list never drifts from it. */
  peptides: readonly string[]
}

const TITLE = 'PepCalc: free, private peptide reconstitution calculator'
export const DESCRIPTION =
  'Work out how much water to add to a peptide vial, the concentration, and how far to draw ' +
  'on your syringe. Track vials and draws, see estimated levels from published data, and keep ' +
  'a private journal. Free, offline, and nothing leaves your device.'
const SOURCE = 'https://github.com/PepCalc/app'

const FEATURES = [
  'Reconstitution: the concentration from the amount in the vial and the water added (mg, mcg or IU per mL)',
  'Draws: the volume in mL and the units on U-100 and U-40 insulin syringes, drawn on a picture of the syringe',
  'Blends: vials holding more than one peptide',
  'A shelf of vials, with each draw logged and the amount left',
  'Estimated levels in the body over time, only for peptides with published human data, each with its source',
  'A journal of weight and BMI, blood sugar, side effects and progress photos, with trends to share',
  'A PDF report of draws, levels and journal entries',
]

const FAQ: readonly [string, string][] = [
  [
    'How much bacteriostatic water should I add to a peptide vial?',
    'PepCalc shows what each amount of water does: the concentration it makes and how many units each draw takes on your syringe, so you can pick a volume that is easy to measure. It does not tell you what to use.',
  ],
  [
    'How do I convert mg to units on an insulin syringe?',
    'Divide the amount by the concentration to get millilitres, then multiply by 100 for a U-100 syringe (or by 40 for U-40). A 10 mg vial with 2 mL of water is 5 mg per mL, and 0.1 mL of it is 10 units on a U-100 syringe.',
  ],
  [
    'Does PepCalc recommend doses?',
    'No. It does arithmetic and shows sourced references; the amount is yours to enter.',
  ],
  [
    'Where is my data stored?',
    'Only on your device. There is no account, no server and no analytics, and PepCalc works offline once it has loaded.',
  ],
  ['Is PepCalc free?', 'Yes, with no ads or paywall. It is open source under the GNU AGPL-3.0.'],
]

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The readable page inside #app, replaced by the app when it mounts. */
export function shellHtml(o: SeoOptions): string {
  const list = (items: readonly string[]) => items.map((i) => `<li>${esc(i)}</li>`).join('')
  return [
    '<main class="pc-shell">',
    '<h1>PepCalc: peptide reconstitution calculator</h1>',
    '<p>Free, private and offline. Work out how much water to add to a peptide vial, the concentration in mg per mL, and how far to draw on your syringe. Everything stays on your device.</p>',
    '<h2>What it does</h2>',
    `<ul>${list(FEATURES)}</ul>`,
    '<h2>Peptides in the catalog</h2>',
    `<p>${esc(o.peptides.join(', '))}, or any peptide you add yourself.</p>`,
    '<h2>The arithmetic</h2>',
    '<p>Concentration = amount in the vial ÷ water added. Volume to draw (mL) = amount ÷ concentration. On a U-100 syringe, units = mL × 100.</p>',
    '<h2>Questions</h2>',
    `<dl>${FAQ.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>`,
    '<p>PepCalc is not medical advice and never recommends a dose. ',
    `<a href="${SOURCE}">Source code</a></p>`,
    '</main>',
  ].join('')
}

/** A schema.org WebApplication record for search engines and AI assistants. */
export function structuredData(o: SeoOptions): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'PepCalc',
    alternateName: 'PepCalc peptide calculator',
    url: o.appUrl,
    description: DESCRIPTION,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Any modern web browser; Android',
    browserRequirements: 'Requires JavaScript',
    softwareVersion: o.version,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    codeRepository: SOURCE,
    image: `${o.appUrl}og.png`,
    featureList: FEATURES,
    keywords:
      'peptide calculator, reconstitution calculator, bacteriostatic water, insulin syringe units, ' +
      o.peptides.join(', '),
  }
}

export function headTags(o: SeoOptions): HtmlTagDescriptor[] {
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs,
    injectTo: 'head',
  })
  return [
    { tag: 'link', attrs: { rel: 'canonical', href: o.appUrl }, injectTo: 'head' },
    meta({ property: 'og:type', content: 'website' }),
    meta({ property: 'og:site_name', content: 'PepCalc' }),
    meta({ property: 'og:locale', content: 'en_US' }),
    meta({ property: 'og:title', content: TITLE }),
    meta({ property: 'og:description', content: DESCRIPTION }),
    meta({ property: 'og:url', content: o.appUrl }),
    meta({ property: 'og:image', content: `${o.appUrl}og.png` }),
    meta({ property: 'og:image:width', content: '1200' }),
    meta({ property: 'og:image:height', content: '630' }),
    meta({ property: 'og:image:alt', content: 'PepCalc, a private peptide calculator' }),
    meta({ name: 'twitter:card', content: 'summary_large_image' }),
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      // "<" is escaped so no text in the record can close the script element.
      children: JSON.stringify(structuredData(o)).replace(/</g, '\\u003c'),
      injectTo: 'head',
    },
    {
      tag: 'style',
      children: SHELL_CSS,
      injectTo: 'head',
    },
  ]
}

/** Readable, in the app's colours, before any app styles load. */
const SHELL_CSS =
  '.pc-shell{max-width:44rem;margin:0 auto;padding:24px 16px 48px;font:16px/1.6 system-ui,sans-serif;color:#1d1a14}' +
  '.pc-shell h1{font-size:1.75rem;line-height:1.2}.pc-shell h2{font-size:1.15rem;margin-top:1.5em}' +
  '.pc-shell dt{font-weight:600;margin-top:.75em}.pc-shell dd{margin:0}.pc-shell a{color:#3f6b52}' +
  '@media (prefers-color-scheme:dark){.pc-shell{color:#f4ede2}.pc-shell a{color:#8fc7a4}}'

/** Catalog names, read from the JSON the app bundles. */
export function catalogPeptides(path: string): string[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as { peptides: { name: string }[] }
  return data.peptides.map((p) => p.name)
}

/** The Vite plugin: production web builds only, never the Android bundle. */
export function seo(options: SeoOptions & { enabled: boolean }): Plugin {
  return {
    name: 'pepcalc-seo',
    apply: 'build',
    transformIndexHtml(html) {
      if (!options.enabled) return html
      const marker = '<div id="app"></div>'
      if (!html.includes(marker)) throw new Error('index.html has no empty #app to fill')
      return {
        html: html.replace(marker, `<div id="app">${shellHtml(options)}</div>`),
        tags: headTags(options),
      }
    },
  }
}
