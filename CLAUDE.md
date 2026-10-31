# PepCalc

Offline, private peptide reconstitution and draw calculator: a static PWA hosted on GitHub
Pages and installable from the browser on Android and iOS, phones and tablets. No backend, no
accounts, no network requests; all data stays in IndexedDB on the device.

## Commands

All commands run on the Node version in `.nvmrc` (`nvm use`); never system Node.

| Command          | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `make install`   | `npm ci`                                                                                         |
| `make dev`       | Vite dev server (no service worker in dev)                                                       |
| `make check`     | Fast gate: lint, format, typecheck, token and contrast checks, markdown, knip, unit tests, build |
| `make check-all` | Full gate before declaring done: adds Playwright e2e (offline, PWA) and `npm audit`              |
| `make preview`   | Serve the production build at `http://localhost:4173/pepcalc/`                                   |
| `make android`   | Build the Capacitor bundle (`dist-android/`) and sync it into `android/`                         |

## Skills and rules

| Skill                                           | Load when                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `.claude/skills/engineering-standards/SKILL.md` | Structure, domain logic, storage, stores, tests, tooling, deployment |
| `.claude/skills/front-end/SKILL.md`             | Components, views, styling, theming, charts                          |
| `.claude/skills/peptide-catalog/SKILL.md`       | Editing `src/data/*.json`                                            |

Path-scoped rules in `.claude/rules/` cover comments, markdown, time, data and privacy, and the
catalog. A post-edit hook lints edited TypeScript and Vue, checks markdown for em-dashes, runs
the catalog tests after JSON edits, and re-checks contrast after token edits.

## Non-negotiables

- No network requests, CDNs, analytics, or remote fonts; every asset is bundled and precached.
- All persistence through `src/db/repository.ts`; schema changes add a Dexie version.
- Arithmetic lives in `src/domain/` (pure, unit tested). IU never converts to mass.
- Every number shown to users carries a source; PK curves only from human data or
  clearly labelled user-supplied values.
- PepCalc does arithmetic and shows sourced references; it never recommends a dose.
