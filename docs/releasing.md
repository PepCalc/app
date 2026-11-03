# Releasing

PepCalc ships from one codebase to the PWA on GitHub Pages, Google Play, F-Droid and, once its
listing is set up, the App Store. iOS builds happen only in GitHub Actions (`ios.yml`), since
there is no Mac.

## Every release

1. Bump `version` and `versionCode` in `package.json`. `versionCode` is
   `major * 10000 + minor * 100 + patch`, so 0.2.0 is 200; the Android build fails if the two
   disagree. It is written out because F-Droid's update checker reads it as a literal number.
2. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` (500 characters at most).
3. `make check-all`, then merge to `main`; Pages deploys on its own.
4. Tag `v<version>` and push the tag. `release.yml` builds the signed `.aab` and `.apk` and
   attaches them to a GitHub release; `ios.yml` uploads an iOS build to App Store Connect
   (TestFlight), once its secrets are set; F-Droid picks up the new tag and builds it.

## Signing

Create one upload key and keep it out of the repository, backed up in two places. A lost key
means the app can never be updated under the same listing.

```bash
keytool -genkeypair -v -keystore upload.jks -alias pepcalc -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 upload.jks   # paste into the PEPCALC_KEYSTORE_BASE64 secret
```

Repository secrets: `PEPCALC_KEYSTORE_BASE64`, `PEPCALC_KEYSTORE_PASSWORD`,
`PEPCALC_KEY_ALIAS`, `PEPCALC_KEY_PASSWORD`. Enrol in Play App Signing so Google holds the
app signing key and this one is only the upload key.

## Google Play

- **Listing.** Title and short description come from `fastlane/metadata/android/en-US/`.
- **Privacy policy.** `https://pepcalc.github.io/privacy.html`.
- **Data safety.** No data collected, no data shared. The app has no network permission, so no
  data is transmitted; data stays on the device and the user can delete it.
- **Health apps declaration.** PepCalc is a calculator and journal, not a medical device, and
  makes no treatment claims; the in-app disclaimer and the store description say so.
- **Content rating and target audience.** Adults (18+).
- **Testing.** New personal developer accounts must run a closed test with enough testers for
  the period Play requires before production access; check the current rule in Play Console.

Play's policies change; read the current Health apps, Unapproved substances and Data safety
pages in Play Console before each submission rather than relying on this list.

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

The screenshots are rendered, not taken on a device: `make store-screenshots` builds the Android
bundle, restores the made-up shelf in `scripts/sample-backup.mjs` through Settings, and writes
PNGs named in display order for each device:

| Folder under `images/`   | Device                   | Viewport, scale | File        |
| ------------------------ | ------------------------ | --------------- | ----------- |
| `phoneScreenshots/`      | Phone                    | 360 x 800, 3x   | 1080 x 2400 |
| `sevenInchScreenshots/`  | 7-inch tablet, upright   | 608 x 1080, 2x  | 1216 x 2160 |
| `tenInchScreenshots/`    | 10-inch tablet, sideways | 1280 x 720, 2x  | 2560 x 1440 |
| `chromebookScreenshots/` | Chromebook window        | 1600 x 900, 2x  | 3200 x 1800 |

`node scripts/store-screenshots.mjs tenInch` retakes one device. Fastlane and F-Droid have no
Chromebook folder, so upload those in Play Console by hand. Retake them after a visible change
to the screens they show (the calculator and its draw, Shelf, a vial, Protocols, and Journal in
dark), and look at each one before committing.

The store icon (`images/icon.png`, 512 x 512) is the logo tile with square corners, since Play
rounds it itself; `npm run icons:android` writes it with the launcher icons. The feature graphic
(`images/featureGraphic.png`, 1024 x 500) was made by hand from the icon and the calculator
screenshot, with no brand names on it.

## iOS

The Xcode project in `ios/` is generated by Capacitor (Swift Package Manager, no CocoaPods) and
checked in with PepCalc's own changes: `Info.plist` explains camera and photo access and
declares no non-exempt encryption, and `PrivacyInfo.xcprivacy` declares that nothing is
collected. `npm run build:ios` builds the web bundle into `dist-ios/` and copies it in. After
changing the logo, run `npm run icons:ios`. As on Android, the origin (`capacitor://localhost`)
is pinned in `capacitor.config.ts`: changing it after release would strand users' data.

`ios.yml` builds the app for the simulator, unsigned, on every change. A version tag, or running
the workflow by hand, archives a signed build and uploads it to App Store Connect, where it
appears in TestFlight. Xcode manages signing with an App Store Connect API key, so no
certificate or profile is kept in the repository.

### One-time setup

1. Join the Apple Developer Program, and note the Team ID (Membership details).
2. In Certificates, Identifiers & Profiles, register the App ID `io.github.pepcalc`. It must
   match `appId` in `capacitor.config.ts` and is permanent once published.
3. In App Store Connect, create the app with that bundle ID.
4. In App Store Connect, Users and Access, Integrations, create a Team API key with the Admin
   role (cloud signing creates the distribution certificate, which needs it). Download the
   `.p8` file; it can be downloaded only once.
5. In the GitHub repository, create an environment named `app-store` and add these secrets:

| Secret          | Value                                            |
| --------------- | ------------------------------------------------ |
| `APPLE_TEAM_ID` | The Team ID                                      |
| `ASC_KEY_ID`    | The key's ID                                     |
| `ASC_ISSUER_ID` | The issuer ID shown above the keys list          |
| `ASC_KEY_P8`    | The full text of the `.p8` file, header included |

6. Run the iOS workflow by hand (Actions, iOS, Run workflow) and check that a build reaches
   TestFlight. Install TestFlight on an iPhone to try it.

### App Store review

- Privacy nutrition label: "Data Not Collected". Privacy policy:
  `https://pepcalc.github.io/privacy.html`.
- Export compliance is answered in `Info.plist` (`ITSAppUsesNonExemptEncryption` is false).
- Screenshots come from TestFlight on a real device or the simulator.
- Read guideline 1.4.2 on drug dosage calculators before submitting.

### Checks on a device

The workflow proves the app compiles; these need an iPhone, through TestFlight:

1. Take a progress photo with the camera and choose one from the library.
2. Share a level chart image and export a PDF report through the share sheet.
3. Save a backup with photos and restore it.
