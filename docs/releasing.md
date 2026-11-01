# Releasing

PepCalc ships from one codebase to the PWA on GitHub Pages and, as a Capacitor Android app, to
F-Droid.

## Every release

1. Bump `version` and `versionCode` in `package.json`. `versionCode` is
   `major * 10000 + minor * 100 + patch`, so 0.2.0 is 200; the Android build fails if the two
   disagree. It is written out because F-Droid's update checker reads it as a literal number.
2. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` (500 characters at most).
3. `make check-all`, then merge to `main`; Pages deploys on its own.
4. Tag `v<version>` and push the tag. F-Droid picks up the new tag and builds it.

## F-Droid

F-Droid builds from source and signs with its own key, so nothing proprietary may be in the
build: Capacitor and its plugins are open source, there are no Google Play Services, and
`dependenciesInfo` is off in `android/app/build.gradle` so no encrypted dependency report is
added. The recipe, [fdroid/io.github.pepcalc.yml](fdroid/io.github.pepcalc.yml), is kept exactly
as it will be submitted:

- `sudo` installs the Node version in `.nvmrc` from nodejs.org, checked against its SHA-256.
  When `.nvmrc` changes, update the URL and the checksum (from `SHASUMS256.txt` beside it).
- `init` runs `npm ci` and `prebuild` builds the web bundle and syncs it into `android/`.
- `scandelete: node_modules` removes the prebuilt native tools npm installs (esbuild, rollup,
  sharp) after the web build has used them and before Gradle runs; F-Droid's scanner rejects
  binaries. Capacitor's Android sources in `node_modules` are not binaries and stay.
- Updates are found from tags: `UpdateCheckData` reads `versionCode` and `version` from
  `package.json` at each `v*` tag.

The F-Droid workflow (`fdroid.yml`) runs `fdroid lint` and `fdroid rewritemeta` on the recipe
and builds this commit with it in fdroiddata's own build container, on every change. Keep it
green; a failure there is a failure F-Droid would hit.

### First submission

1. Tag the release (`v<version>`) and push the tag. The recipe's `commit` names that tag, and
   its `versionName`, `versionCode`, `CurrentVersion` and `CurrentVersionCode` match it.
2. Fork `fdroid/fdroiddata` on GitLab, copy the recipe to `metadata/io.github.pepcalc.yml`, and
   open a merge request using the "App inclusion" template. Its pipeline repeats the lint and
   build.
3. Later releases need only a new tag: F-Droid's update checker adds the build.

### Listing

The title, descriptions, changelogs, icon and screenshots come from
`fastlane/metadata/android/en-US/` in this repository. The icon is `public/pwa-512x512.png`;
copy it again after changing the logo.

The phone screenshots in `images/phoneScreenshots/` are rendered, not taken on a device: `make
store-screenshots` builds the Android bundle, restores the made-up shelf in
`scripts/sample-backup.mjs` through Settings in a 360 x 800 phone viewport at 3x, and writes
1080 x 2400 PNGs named in display order. Retake them after a visible change to the screens they
show (the calculator and its draw, Shelf, a vial, History, and Journal in dark), and look at
each one before committing.
