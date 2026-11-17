# Architecture

Part of the `engineering-standards` skill.

## Layout

```
src/
  domain/        pure logic: units (dose quantities), bodyUnits (weight and height),
                 unitDefaults (regional default display units from CLDR), reconstitution, diluent advice, syringe, pk, levels (pooling and the curve
                 model), overlay (several peptides on one chart), projection (levels ahead),
                 schedule (when a protocol is next due), timeOfDay (wall-clock HH:MM input values),
                 inventory, blend, listing (paging,
                 ordering), vials (numbering, keys), vial age, body (measurements, length
                 units, BMI, WHO bands), glucose, symptoms, photos, collage and crop (photo
                 collage), doseBands (dose bands and callout pills on a trend), progressStats
                 (headline weight change and weekly rate), range (chart window ranges), report
                 (periods, windows, axis ticks), drawTotals (totals by unit), vitals (blood
                 pressure and heart rate), healthSync (what to import and export, matching),
                 entries, entryDays (calendar day marks), entryText, due (due-card sorting), reminderDays (reminder plans
                 from schedules), reminders (when to remind, grouping, capping, notification
                 wording), calendar (calendar invites), catalog types
  brand.ts       per-app strings read by shared components (wordmark, health sync summary)
  logKinds.ts    loggable entry kind definitions (labels, icons, routes, order)
  data/          peptides.json, syringes.json, their JSON Schemas, typed loader (index.ts)
  db/            Dexie database (schema history), repository, backup export/restore
  stores/        Pinia: shelf (vials + draws), protocols (a schedule per peptide), journal
                 (measurements, side effects, blood sugar, vitals), photos, levelPick (which
                 peptides a chart shows), settings, healthSync (Health apps choices), log, notify,
                 confirm
  composables/   useCalculator, useDiluentAdvisor, useBodyMetrics, useCameraAccess,
                 useChartColors, useDoseBands, useDueItems, useInstallPrompt, useStoragePersistence, useNow,
                 useEntries, usePaging, usePhotoPins, useReminderSync, useScheduledDays, useVialAge, useHideOnScroll, useReportExport,
                 useHealthAutoSync, useWeightSummary
  services/      time.ts (the only clock and date formatter), locale.ts (device region and
                 measurement system), fileTransfer.ts (share/download),
                 nativeFileTransfer.ts (the same through the apps' share sheet), platform.ts
                 (words that depend on the build), photos/ (canvas re-encode),
                 reminders/ (native local notifications),
                 pdf/ (dependency-free PDF writer), report/ (the PDF report: data, layout, charts),
                 health/ (Apple Health and Health Connect through @capgo/capacitor-health,
                 loaded only in the apps; runSync, the sync loop)
  components/    calculator/, charts/, common/, journal/, photos/, protocols/, reminders/, report/,
                 share/, shelf/, today/ (DueCard)
  views/         one per route: Today, Stack, Peptide, Levels, Vial, Calculator, Progress, Entries, Settings, Health
                 (apps only)
  plugins/       vuetify.ts (themes, defaults), icons.ts (inline SVG icons), fonts.ts
  styles/        tokens.css (design tokens), theme.css (global and Vuetify overrides)
public/          icons, favicon, layers.css (cascade layer order, linked before bundles)
tests/           Vitest, mirrors src/
e2e/             Playwright against `vite preview` of the production build
scripts/       gate scripts (contrast, tokens, markdown, parity)
vendor/          patched copies of build-time dependencies (see testing-and-gates.md)
build/           Vite plugins that patch a dependency at build time (see testing-and-gates.md)
```

## Data flow

A view reads from a store or a composable; a store reads and writes through `repository`;
the repository is the only code that touches Dexie. Arithmetic is always a call into
`domain/`. The calculator keeps its inputs in `useCalculator` (not a store) because they are
per-visit; anything that must survive a reload goes into the database.

## Storage

- IndexedDB via Dexie, database `pepcalc`. Tables: `vials`, `draws`, `settings` (key/value);
  the journal's `measurements`, `symptoms`, `glucose`, `photos`, `photoImages` and
  `photoThumbs` (version 2); `protocols` (version 3, holding `schedule`, `plannedDose` and
  `course` from version 5); `vitals` (version 4: blood pressure and
  resting heart rate, stored as typed in mmHg and bpm, with no unit setting).
- Writes pass through `toPlain` (`src/db/plain.ts`) in a Dexie middleware. IndexedDB cannot
  clone a Vue proxy; without the copy a store that saves its own reactive state fails with
  `DataCloneError`.
- Health apps sync is off until the user turns it on, and only adds: neither health store lets
  an app edit or delete another app's records. The `healthSync` setting keeps the user's
  choices and the ids of rows already in the store, so nothing is sent or taken twice; a
  reading counts as present on the other side at the same minute and value. Imported rows are
  ordinary journal rows with a "From Apple Health" or "From Health Connect" note. A restored
  backup keeps the choices but turns sync off and starts the bookkeeping over.
- A source with 24 or more glucose readings in a local day is a continuous monitor. Its day is
  stored once, after the day ends, as a `daily` glucose row (average in `value`, plus median,
  lowest, highest and count), never as its raw readings. Monitor days are never exported.
- Ids are `crypto.randomUUID()`; timestamps are UTC ISO strings.
- Deleting a vial deletes its draws in the same transaction. Archiving keeps both.
- `navigator.storage.persist()` is requested on launch (Settings shows the result). Safari may
  still evict data; a backup file (Settings, Save a backup) is the only guarantee. Safari tabs
  and Home Screen apps on iOS keep separate storage.
- Backups are versioned JSON (`format: "pepcalc-backup"`, version 7). `parseBackup` validates
  untrusted input fully (migrating older protocol rows on restore) before `restoreBackup`
  replaces data atomically.

## Schedules

A protocol's `schedule` is one of five kinds: `interval` (every N hours from the last draw),
`daily` (fixed times each day), `weekly` (chosen ISO weekdays at fixed times), `cycle` (days on
and days off from a local `YYYY-MM-DD` anchor date) or `asNeeded` (no due time). Fixed-time slots
are built from local wall-clock time through `LocalCalendar` (`src/services/time.ts`), so a
chosen time stays at that wall-clock hour across daylight-saving changes. A draw covers a slot `s`
when logged at or after `s` minus half the gap from the preceding slot, capped at 12 hours; the
next due time is the first uncovered slot. `asNeeded` has no due time and always returns null.

## Reminders

Dose reminders exist only in the native app: a web app can notify on time only through a push
server, which PepCalc will not run. `domain/reminderDays.ts` turns a protocol's schedule and next
due time into a `ReminderPlan` over a 7-day horizon: exact times for `daily`, `weekly`, `cycle` and
sub-24-hour `interval` schedules, or due days for intervals of 24 hours or more (`asNeeded`
produces none). `domain/reminders.ts` plans exact-time reminders with `leadMinutes` (`planAtTimes`)
or day-based reminders (`planReminders`), groups reminders falling in the same minute
(`groupByMinute`), and caps at 60 pending notifications (`MAX_PENDING`) because iOS silently drops
pending local notifications past 64 per app. `useReminderSync` (mounted in App) replaces every
pending notification whenever protocols, vials, draws or reminder settings change, and on
`visibilitychange`. Alarms are inexact and `SCHEDULE_EXACT_ALARM` is removed from the manifest.
Text is generic unless the user turns on names (`showNames`, off by default). A single-subject tap
routes to `#/?log=<protocol id>`, which Today turns into Log a draw for that peptide's active
vial; a grouped tap routes to Today (`#/`).

A peptide page's Reminder section and Settings open Add reminder (`components/reminders/AddReminderDialog.vue`):
Notify me or Add calendar invite. Notify me asks for permission only after explaining it, turns the
reminder on once allowed, and when blocked opens PepCalc's notification settings through an
app-local plugin (`NotificationSettingsPlugin`), checking again on return. Permission checks go
through `services/reminders/notificationAccess.ts`, which is "unsupported" on the web (shown
disabled with the reason). Reminder choices live under the `reminders` setting key, sanitised on
load; restoring a backup keeps the choices with every subject turned off (`restoredReminders`).

Calendar export (`domain/calendar.ts`, `components/reminders/CalendarInviteForm.vue`) handles each
schedule kind: whole-day intervals produce one event at a chosen time (`everyDays`), `daily`
produces one event per scheduled time (`everyDays: 1`), `weekly` produces one event per time
(`weekdays`), and `cycle` produces one `.ics` event per time with 12 weeks of `RDATE` lines and no
Google or Outlook links; sub-24-hour intervals and `asNeeded` explain why calendar export is not
offered.

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
BMI, blood sugar, blood pressure and heart rate, side effects, draw log. Sections with nothing in the period are offered but
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
Android-only calls (clearing the camera's capture file) check `__PLATFORM__`. Each has an
app-local `NotificationSettings` plugin (Java and Swift) that opens PepCalc's notification settings,
and an app-local `RegionalPreferences` plugin (Java and Swift) that reads the device's region and
measurement system. iOS is built and uploaded only by `.github/workflows/ios.yml`.

## PWA and hosting

- `build/seo.ts` makes the single-page app findable (web builds only, never native): a plain
  description of PepCalc inside `#app` that Vue replaces on mount (crawlers and AI assistants
  that don't run JavaScript read it), canonical and Open Graph tags pointing at the app's address
  (`PEPCALC_SITE_URL`, default `https://pepcalc.github.io/`, plus the base path), and a
  `WebApplication` JSON-LD record. `robots.txt`, `sitemap.xml` and `llms.txt` live at the origin
  root, so the website repository (`PepCalc/pepcalc.github.io`) publishes them. Peptide names come from the catalog.
  `public/og.png` is the link-preview image and is kept out of the precache.

- `vite-plugin-pwa` (generateSW) precaches every built asset, including the ECharts chunk and
  fonts. `registerType: 'prompt'`: an update waits until the user reloads (`UpdatePrompt.vue`). The manifest includes a `Calculator` shortcut to `#/calculator`.
- Base path comes from `PEPCALC_BASE` (default `/app/`): the app is the `PepCalc/app`
  repository, served by Pages at `/app/` beside the website at the root. The router uses hash history so
  every URL resolves to `index.html` on GitHub Pages and offline. `/` opens `Today` (redirecting `/?vial=` and `/?peptide=` to `/calculator`), and `/calculator` opens the calculator. Legacy routes (`/shelf`,
  `/shelf/:id`, `/protocols`, `/history`) redirect permanently to `/stack` and `/stack/vial/:id`;
  `/journal` redirects permanently to `/progress`, and `/progress/entries` holds the entries timeline.
- A production-only meta CSP (`default-src 'self'`) is injected by `vite.config.ts`, because
  GitHub Pages cannot set headers. Styles need `'unsafe-inline'` for Vuetify's theme tag.

## Sibling app

`parity.json` at the repository root and `scripts/parity.mjs` enforce parity with Gliplog.
Every path under `roots` that exists in both apps is shared (identical after neutralising the
brand) unless `diverged` lists it with a one-sentence reason.
