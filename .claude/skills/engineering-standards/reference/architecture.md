# Architecture

Part of the `engineering-standards` skill.

## Layout

```
src/
  domain/        pure logic: units, reconstitution, diluent advice, syringe, pk, levels (pooling and
                 the curve model), inventory, blend, listing (paging, ordering, vial numbers),
                 vial age, report (periods, windows, totals, axis ticks), catalog types
  data/          peptides.json, syringes.json, their JSON Schemas, typed loader (index.ts)
  db/            Dexie database (schema history), repository, backup export/restore
  stores/        Pinia: shelf (vials + draws), settings, notify, confirm
  composables/   useCalculator, useDiluentAdvisor, useChartColors, useInstallPrompt, useStoragePersistence, useNow,
                 usePaging, useVialAge, useHideOnScroll, useReportExport
  services/      time.ts (the only clock and date formatter), fileTransfer.ts (share/download),
                 pdf/ (dependency-free PDF writer), report/ (the PDF report: data, layout, charts)
  components/    calculator/, charts/, history/, shelf/, common/
  views/         one per route: Calculator, Shelf, Vial, Journal, Protocols, Settings
  plugins/       vuetify.ts (themes, defaults), icons.ts (inline SVG icons), fonts.ts
  styles/        tokens.css (design tokens), theme.css (global and Vuetify overrides)
public/          icons, favicon, layers.css (cascade layer order, linked before bundles)
tests/           Vitest, mirrors src/
e2e/             Playwright against `vite preview` of the production build
scripts/         gate scripts (contrast, tokens, markdown)
vendor/          patched copies of build-time dependencies (see testing-and-gates.md)
build/           Vite plugins that patch a dependency at build time (see testing-and-gates.md)
```

## Data flow

A view reads from a store or a composable; a store reads and writes through `repository`;
the repository is the only code that touches Dexie. Arithmetic is always a call into
`domain/`. The calculator keeps its inputs in `useCalculator` (not a store) because they are
per-visit; anything that must survive a reload goes into the database.

## Storage

- IndexedDB via Dexie, database `pepcalc`. Tables: `vials`, `draws`, `settings` (key/value).
- Ids are `crypto.randomUUID()`; timestamps are UTC ISO strings.
- Deleting a vial deletes its draws in the same transaction. Archiving keeps both.
- `navigator.storage.persist()` is requested on launch (Settings shows the result). Safari may
  still evict data; a backup file (Settings, Save a backup) is the only guarantee. Safari tabs
  and Home Screen apps on iOS keep separate storage.
- Backups are versioned JSON (`format: "pepcalc-backup"`). `parseBackup` validates untrusted
  input fully before `restoreBackup` replaces data atomically.

## PK model

`domain/pk.ts` implements a one-compartment model with first-order absorption and elimination
(the Bateman function), superposed over doses. `ka` is solved from the published half-life and
time to peak by bisection, which handles flip-flop kinetics. The output is an amount in the body
in dose units, not a concentration: volume of distribution and bioavailability are unknown for
most of these peptides. Sampling is adaptive so short peaks (tesamorelin, about 9 minutes) are
not missed by a coarse grid.

## PDF reports

The report is written by PepCalc's own PDF writer (`services/pdf/`), not a library: no
third-party code handles the user's data, and the output is easy to audit.

| Module                    | Role                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `pdf/text.ts`             | WinAnsi encoding, transliteration, exact Helvetica widths, wrapping, escaping |
| `pdf/fontMetrics.ts`      | Generated Helvetica width tables (Adobe Core 14, checked against Nimbus Sans) |
| `pdf/document.ts`         | `PdfPage` drawing API (top-left coordinates) and `buildPdf` serialisation     |
| `report/reportData.ts`    | `ReportData` and the sections a reader can choose (`REPORT_SECTIONS`)         |
| `report/collectReport.ts` | Store rows to `ReportData`: period, chosen sections, curves, charts, sources  |
| `report/renderReport.ts`  | Pure layout of `ReportData` to bytes; deterministic, tested without a browser |
| `report/layout.ts`        | Page flow: headings kept with what follows, figures, paged tables, footers    |
| `report/pdfChart.ts`      | Vector charts over time: series, draw markers, guides, stacked panels         |
| `report/printPalette.ts`  | Light-theme colours for paper, tested against `tokens.css`                    |

The reader picks the period and the sections: combined chart, estimated levels, weight and
BMI, blood sugar, side effects, draw log. Sections with nothing in the period are offered but
disabled. The combined chart stacks the other chosen sections on one time axis (separate
panels, never a second value axis), so a section left out is left out of the whole file.

Rules the writer keeps:

- **Text:** standard Helvetica, so nothing is embedded. Every character is one WinAnsi byte, so
  cross-reference offsets are exact. Text enters a content stream only through `pdfString`,
  which escapes it, so a vial name cannot inject operators.
- **No hidden content:** no scripts, actions, links, attachments, timestamps or producer. The
  only metadata is the title.
- **Loading:** `useReportExport` imports the renderer lazily, so it is its own precached chunk
  and works offline.

## Native apps

`vite build --mode android` and `--mode ios` set `__NATIVE__` and `__PLATFORM__` and write to
`dist-android/` or `dist-ios/`; `PEPCALC_PLATFORM=ios` makes `cap sync` copy the iOS one.
Android-only calls (clearing the camera's capture file) check `__PLATFORM__`. iOS is built and
uploaded only by `.github/workflows/ios.yml`.

## PWA and hosting

- `build/seo.ts` makes the single-page app findable (web builds only, never native): a plain
  description of PepCalc inside `#app` that Vue replaces on mount (crawlers and AI assistants
  that don't run JavaScript read it), canonical and Open Graph tags pointing at the app's address
  (`PEPCALC_SITE_URL`, default `https://pepcalc.github.io/`, plus the base path), and a
  `WebApplication` JSON-LD record. `robots.txt`, `sitemap.xml` and `llms.txt` live at the origin
  root, so the website repository (`PepCalc/pepcalc.github.io`) publishes them. Peptide names come from the catalog.
  `public/og.png` is the link-preview image and is kept out of the precache.

- `vite-plugin-pwa` (generateSW) precaches every built asset, including the ECharts chunk and
  fonts. `registerType: 'prompt'`: an update waits until the user reloads (`UpdatePrompt.vue`).
- Base path comes from `PEPCALC_BASE` (default `/app/`): the app is the `PepCalc/app`
  repository, served by Pages at `/app/` beside the website at the root. The router uses hash history so
  every URL resolves to `index.html` on GitHub Pages and offline.
- A production-only meta CSP (`default-src 'self'`) is injected by `vite.config.ts`, because
  GitHub Pages cannot set headers. Styles need `'unsafe-inline'` for Vuetify's theme tag.
