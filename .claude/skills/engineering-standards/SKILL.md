---
name: engineering-standards
description: 'Use when changing pepcalc code structure, the domain layer, storage, stores, composables, tests, tooling, or deployment.'
---

# Engineering standards

One-line rules; detail lives in `reference/`. Front-end styling and components are the
`front-end` skill; the peptide and syringe JSON is the `peptide-catalog` skill.

| Read                             | When                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| `reference/architecture.md`      | Adding a module, deciding where code goes, or touching storage       |
| `reference/testing-and-gates.md` | Writing tests, the toolchain, CI, deployment, or declaring work done |

## Gates (check these first)

1. Before declaring done: `make check-all` (lint, format, typecheck, token and contrast checks,
   markdown, knip, unit tests, build, Playwright e2e including offline, `npm audit`) on the Node
   version in `.nvmrc`. Never run the gates on system Node.
2. A rule that must be relaxed is relaxed in `eslint.config.js` with a comment, never by an
   inline disable. Knip findings are deleted, not ignored.
3. Tests live under `tests/` mirroring `src/` (unit and component, Vitest) and `e2e/`
   (Playwright against the production build); never inside `src/`.

## Layering

4. `src/domain/` is pure TypeScript: no Vue, no Dexie, no DOM, no clock. All arithmetic (units,
   reconstitution, syringes, PK, inventory, blends) lives here with unit tests.
5. `src/db/` owns persistence. Views and stores call `repository`, never Dexie tables. Pass it
   plain data: IndexedDB cannot clone a Vue reactive object (`DataCloneError`), and a spread
   copies nested arrays and objects as proxies. Build the value to store from plain parts.
6. Shared state lives in Pinia stores (`src/stores/`); a module-level `ref` shared across
   components is a store. Notifications go through `useNotifyStore`, confirmations through
   `useConfirmStore().ask()`.
7. Composables return `state` (reactive), optional read-only computed values, and `actions`.
8. Units never mix silently: IU never converts to mass; `convert()` throws. Validate in the
   domain, not only in the UI.

## Privacy and offline

9. No network requests of any kind; every asset is bundled and precached (`.claude/rules/data-and-privacy.md`).
10. Schema changes add a Dexie version with an upgrade; backup validation follows row shapes.
11. Time is UTC ISO in storage and formatted only in `src/services/time.ts`.
