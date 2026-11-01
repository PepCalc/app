# Testing, gates, toolchain, deployment

Part of the `engineering-standards` skill.

## Gates

| Command          | What it runs                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `make check`     | lint, format check, typecheck, token check, contrast check, markdown check, knip, Vitest, build |
| `make check-all` | `make check`, Playwright e2e (phone and tablet), `npm audit --audit-level=low`                  |

CI (`.github/workflows/ci.yml`) runs the full gate on pull requests. Deployment
(`.github/workflows/deploy.yml`) runs `npm run check` and publishes `dist/` to GitHub Pages on
every push to `main`. `.github/workflows/android.yml` builds a debug APK from
`npm run build:android` (Capacitor, base `/`, no service worker, `__NATIVE__` true) and fails
if the merged manifest requests a network permission. `.github/workflows/ios.yml` builds the iOS
app (`npm run build:ios`, `__PLATFORM__` "ios") for the simulator, unsigned, and fails if
`Info.plist` relaxes App Transport Security; on a `v*` tag it uploads a signed build to App Store
Connect. `.github/workflows/release.yml` builds the signed Android bundle and APK on a `v*` tag.
The e2e suite covers only the web build,
so native-only paths (`src/services/nativeFileTransfer.ts`) need a check on a device.

## Tests

- Domain logic: exhaustive unit tests, including the reference check (5 mg in 2 mL, 250 mcg is
  0.1 mL, 10 units on U-100) and published PK parameters round-tripping through the solver.
- Catalog: `tests/data/catalog.spec.ts` validates both JSON files against their schemas and
  checks unit compatibility, blend totals, and that every launch peptide exists.
- Storage: `fake-indexeddb` gives each test its own database; tests delete it afterwards.
- Components: mount with a real Vuetify (`tests/helpers.ts`); assert what a user or screen
  reader perceives (pressed state, aria-label), not internals. The suite must be warning-free.
- E2E: runs against the production build under the Pages base path, because the service worker
  only exists there. It covers the calculator, the shelf workflow, an offline reload with
  stored data, manifest and service-worker scope, and the absence of third-party requests.
- E2E projects: `phone` (Pixel 7, Chromium), `tablet` (iPad landscape, Chromium), and `iphone`
  (iPhone 15, WebKit). `iphone` runs in CI, or locally with `PEPCALC_E2E_WEBKIT=1` after
  `sudo npx playwright install-deps webkit`. The service-worker specs skip on WebKit because
  Playwright does not drive WebKit service workers reliably; check installs on a real iPhone.
- Inject time through `Clock`; never sleep in a test.

## Toolchain

| Tool       | Version line        | Note                                                                              |
| ---------- | ------------------- | --------------------------------------------------------------------------------- |
| Node       | 24 LTS via `.nvmrc` | `package.json` engines match; CI reads `.nvmrc`                                   |
| Vite       | 8                   | `vite-plugin-pwa` 2 (Workbox 7)                                                   |
| Vue        | 3.5                 | Router 5 (classic API, hash history), Pinia 4 (needs `@vue/devtools-api`)         |
| Vuetify    | 4                   | cascade layers; MD3 typography classes (`text-headline-large`, `text-body-small`) |
| TypeScript | 6.0                 | held below 7 until typescript-eslint supports it                                  |
| Vitest     | 5                   | happy-dom environment                                                             |

Run `npm audit --audit-level=low` before every change set: any advisory fails the gate. CI also
runs `npm audit signatures`, which verifies registry signatures and provenance and needs network
access to sigstore. Use `npm ci` in CI.

## Dependency overrides

`package.json` `overrides` patch advisories in transitive build tools that have no fixed release.
Each is build-time only; none reaches the shipped bundle. Remove an override once its parent
ships the fix, then rerun `npm audit`.

| Override                          | Why                                                                                  | Drop when                          |
| --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `xcode` > `uuid` 11.1.1           | GHSA-w5hq-g745-h8pq; `@capacitor/cli` 8.5 pins `xcode` 3, which pulls `uuid` 7       | `@capacitor/cli` is 8.6 or later   |
| `deepmerge` to `vendor/deepmerge` | GHSA-gcqx-w48m-w2h4 has no upstream release; the vendored copy is 4.3.1 plus the fix | deepmerge releases a fixed version |

`vendor/deepmerge` is a root `devDependency` (`file:`) that the override references as
`$deepmerge`: a bare `file:` override resolves relative to the dependent package and breaks
`npm ci`. Its tests are `tests/vendor/deepmerge.spec.ts`; the service worker it helps build was
byte-identical before and after the swap.

## Build-time patches

A bug in a shipped dependency that is too small to vendor the whole package is fixed by a Vite
plugin in `build/` that rewrites the one module. It runs in the production and Android builds,
in Vitest, and in the dev pre-bundle (`optimizeDeps.rolldownOptions.plugins`). The build fails
if the expected source is missing, so an upgrade cannot ship the dependency unpatched.

| Patch                                                          | Why                                                                                                                    | Drop when                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `build/vuetify-ripple-patch.ts` (`directives/ripple/index.js`) | A touch under 80 ms leaves a ripple on screen: the deferred hide reads `currentTarget` after dispatch, when it is null | Vuetify ships the fix upstream |

Its tests are `tests/vendor/vuetify-ripple.spec.ts` and the e2e fling test in `e2e/app.spec.ts`.
