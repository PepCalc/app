# PepCalc

Offline, private peptide reconstitution and draw calculator: a static PWA on GitHub Pages at
`https://pepcalc.github.io/app/`, installable from the browser on Android and iOS, phones and
tablets, and a Capacitor Android app. No backend, no accounts, no network requests; all data
stays in IndexedDB on the device. The website is the separate `PepCalc/pepcalc.github.io`
repository, which shares this origin.

## Commands

All commands run on the Node version in `.nvmrc` (`nvm use`); never system Node.

| Command                  | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `make install`           | `npm ci`                                                                                         |
| `make dev`               | Vite dev server (no service worker in dev)                                                       |
| `make check`             | Fast gate: lint, format, typecheck, token and contrast checks, markdown, knip, unit tests, build |
| `make check-all`         | Full gate before declaring done: adds Playwright e2e (offline, PWA) and `npm audit`              |
| `make preview`           | Serve the production build at `http://localhost:4173/app/`                                       |
| `make android`           | Build the Capacitor bundle (`dist-android/`) and sync it into `android/`                         |
| `make store-screenshots` | Retake the F-Droid phone screenshots in `fastlane/metadata` with sample data                     |

## Skills and rules

| Skill                                           | Load when                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `.claude/skills/engineering-standards/SKILL.md` | Structure, domain logic, storage, stores, tests, tooling, deployment |
| `.claude/skills/front-end/SKILL.md`             | Components, views, styling, theming, charts                          |
| `.claude/skills/peptide-catalog/SKILL.md`       | Editing `src/data/*.json`                                            |

Path-scoped rules in `.claude/rules/` cover comments, markdown, time, data and privacy, and the
catalog. A post-edit hook lints edited TypeScript and Vue, checks markdown for em-dashes, runs
the catalog tests after JSON edits, and re-checks contrast after token edits. Releases and the
F-Droid recipe are in `docs/releasing.md`.

## Non-negotiables

- No network requests, CDNs, analytics, or remote fonts; every asset is bundled and precached.
- All persistence through `src/db/repository.ts`; schema changes add a Dexie version.
- Arithmetic lives in `src/domain/` (pure, unit tested). IU never converts to mass.
- Every number shown to users carries a source; PK curves only from human data or
  clearly labelled user-supplied values.
- PepCalc does arithmetic and shows sourced references; it never recommends a dose.
