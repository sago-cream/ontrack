# Android and Google Play releases

OnTrack uses Capacitor 8 to bundle the web app with native widgets, sharing,
launcher icons, Play Billing, and update checks. The package is
`dev.hsichen.ontrack`, minimum Android 7 (API 24), target Android 16 (API 36).

## Current progress

This work builds on `feat/android-play-release` at `f14bfa3`, which already
incorporates iOS 0.5.1 and the [Android parity work](android-parity.md).
The release additions follow the ColorInvo “ci andriod” task:

| Release requirement                               | OnTrack status                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App, widgets, sharing, themes, purchases, updates | Implemented on the Android branch                                                                                                                             |
| Candidate without an account or upload key        | `android:candidate`; CI retains debug APK, unsigned AAB, mapping, and provenance                                                                              |
| Signed artifact verification                      | Checks key access, certificate, complete bundle signatures, package/version, SDK, permissions, HTTPS, backup, native alignment, and bundled web configuration |
| Store copy and artwork                            | English and Traditional Chinese listing, icon, feature graphic, four phone screenshots each; checked for dimensions, alpha, duplicates, and text limits       |
| Privacy                                           | Bilingual Android, location, widget, backup, and Google Play purchase disclosures prepared in website source                                                  |
| Upload and promotion                              | Manual workflow; internal draft and validate-only defaults; explicit version promotion; signed artifact archived before upload                                |
| Backend and public policy                         | `android:policy:check` checks the deployed Android origin and policy before upload/promotion; deployment remains separate                                     |
| Device compatibility                              | CI runs API 24 and 36; real Play purchase/update and physical-device checks still required                                                                    |

## Verification in this checkout — 2026-09-12

- 51 shared web/backend tests, ESLint, TypeScript, and 22 release-tooling tests passed.
- Debug APK, unsigned release candidate, JVM tests, debug/release lint, bundletool,
  and signed AAB verification passed. The current bundle contains no native `.so`
  libraries; synthetic tests exercise rejection of incompatible 16 KB alignment.
- All five instrumented app tests passed on the local API 35 emulator; four
  screenshots per language were captured at 1080×1920 and visually inspected.
- A disposable upload key and RSA billing-key fixture passed the complete signed
  build and artifact checks. Its AAB was moved to `build/outputs/rehearsal` and
  the key was deleted. It is not a production upload key or a distributable build.
- Upload/listing and exact-version promotion Gradle task graphs passed `--dry-run`;
  no Play API call, credential installation, website deployment, or publishing
  occurred. Actions YAML passed actionlint. API 24/36 jobs are configured but have
  not yet run on GitHub.
- The production preflight still fails: `/api/stations` returns HTTP 403 to the
  Android origin, and the public privacy page does not yet include Google Play.
- Remote `main` remains `5244146`; the original Android port and this follow-up
  branch have not been pushed. Push/merge is needed to activate the workflows.

## Local preparation

Install Bun 1.3.9, JDK 21 (scripts accept 21–24), Android SDK Platform 36 and
Build Tools 36.0.0. For emulator work, put `adb` on PATH and select a device with
`ANDROID_SERIAL` if more than one is connected.

```sh
bun install --frozen-lockfile
bun run android:candidate
```

This runs listing checks, app JVM tests, debug/release lint, and builds a debug
APK plus an **unsigned** release AAB. It does not require Play credentials and
forces showcase data off. It does not contact Play or prove production access.

Other checks:

```sh
bun run android:test:release  # release-tooling regression tests, no account/SDK
bun run android:test:device   # actual app tests on the selected emulator
bun run android:policy:check  # read-only checks against the public service
```

The Android WebView uses `Origin: https://localhost`. The deployed worker must
allow that exact origin. The committed CORS change and updated privacy policy
must reach production before automated upload succeeds. `ANDROID_API_ORIGIN`
can select another HTTPS origin for local builds; the release manifest records
it, and artifact verification rejects an unintended backend.

## Store screenshots

```sh
bun run android:screenshots
```

Use an API 33+ emulator. The command temporarily sets its display to
1080×1920, captures main/settings/message/time screens in English and
Traditional Chinese, restores its previous display size, and validates the
listing. It resets showcase app preferences on that emulator. Captures come
from real app rendering with deterministic train data, without a supporter
entitlement. Source assets live under `apps/android/app/src/main/play`.

[Google's preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
are checked locally, including the 2:1 maximum screenshot aspect ratio and
24-bit PNG without alpha. The four 1080×1920 screenshots also meet the documented
size/count recommendation for app recommendations.

## Upload signing and first bundle

Create and securely back up a persistent upload key. Never commit it:

```sh
keytool -genkeypair -keystore ontrack-upload.jks -alias ontrack-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Copy `.env.android.example` into the ignored root `.env`, or export the values.
`ANDROID_KEYSTORE_PATH` must be absolute. All four signing settings are required:
`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`.

Set `ANDROID_VERSION_NAME` and a new `ANDROID_VERSION_CODE` (1–2100000000).
Do not reuse a code already uploaded to Play.

```sh
bun run android:release
```

The signed AAB is at
`apps/android/app/build/outputs/bundle/release/app-release.aab` beside
`release-manifest.json` (package/version, target SDK, web configuration,
SHA-256, source commit, working-tree state). Verification uses pinned,
checksum-verified bundletool 1.18.3. It checks native ELF and generated APK
alignment for [16 KB page support](https://developer.android.com/guide/practices/page-sizes).

A signing-only bundle may omit the billing public key for the initial manual
Console upload; supporter purchases are then disabled. Automated upload requires
a bundle built with a valid `PLAY_BILLING_PUBLIC_KEY`. Do not distribute the
signing-only rehearsal as the finished app.

## GitHub Actions setup

Create the `google-play` environment in the repository and add:

| Kind     | Name                        | Value                                             |
| -------- | --------------------------- | ------------------------------------------------- |
| Secret   | `ANDROID_KEYSTORE_BASE64`   | Base64 contents of the backed-up upload keystore  |
| Secret   | `ANDROID_KEYSTORE_PASSWORD` | Keystore password                                 |
| Secret   | `ANDROID_KEY_ALIAS`         | Upload alias                                      |
| Secret   | `ANDROID_KEY_PASSWORD`      | Alias password                                    |
| Secret   | `PLAY_SERVICE_ACCOUNT_JSON` | Complete Google service-account JSON, not a path  |
| Variable | `PLAY_BILLING_PUBLIC_KEY`   | Base64 RSA licensing public key from Play Console |

Only upload/promote need the service account; candidate needs none of these.
Configure environment reviewers if desired. Credentials are written to temporary
files and removed even after failure. Workflow concurrency serializes Play edits.

After these workflow files reach the default branch, open **Actions → Android
Play release → Run workflow** and select a source ref and operation:

| Operation   | Outcome                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `candidate` | Shared tests, app checks, API 24/36 emulator tests, unsigned candidate artifacts                 |
| `bundle`    | Same verification, then a signed AAB archived for manual first upload                            |
| `upload`    | Same verification and signed archive, then live-service checks and exact-artifact/listing upload |
| `promote`   | Promote the specified existing version code from `source_track` to `track`, without rebuilding   |

`validate_only=true` asks Google to validate an edit without committing it.
It still contacts Google and uploads bytes for validation. Run again with
`validate_only=false` when ready to commit. Uncommitted GPP edit IDs are cleared
between invocations, so an old rehearsal cannot be accidentally committed.
`release_status=draft` keeps the release in draft; `completed` makes it available
subject to Google review and account eligibility. Source and destination tracks
must differ for promotion.

Local equivalents:

```sh
bun run android:publish              # build + validate exact AAB and listing
PLAY_VALIDATE_ONLY=false bun run android:upload  # existing verified AAB
PLAY_SOURCE_TRACK=internal PLAY_TRACK=beta ANDROID_VERSION_CODE=2 \
  bun run android:promote            # defaults to validation only
```

The existing [Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher/tree/3.12.1)
handles publishing; no second publishing SDK or Ruby toolchain is required.

## Remaining Play Console and release work

1. Create/verify the developer account and app `dev.hsichen.ontrack`; enroll in
   Play App Signing and upload the first signed AAB manually. The Play API cannot
   create the initial app release.
2. Publish the prepared worker/CORS and website privacy update; run
   `bun run android:policy:check` until it passes.
3. Enable the Google Play Android Developer API, create a service account, and
   grant this app's listing and intended-track release permissions in Play Console.
4. Create the non-consumable product `ontrack.supporter_pack`, localized pricing,
   and license testers; set the billing key before building a distributable release.
5. Complete app access, ads, rating, target audience, news/government declarations,
   privacy URL, countries, and Data safety. Use
   `https://ontrack.hsichen.dev/docs/privacy` and
   `https://ontrack.hsichen.dev/docs/support`. Review the actual app/SDK behavior;
   these tools do not submit legal declarations on your behalf.
6. Run a Play internal installation through purchase, pending/cancellation,
   acknowledgment, restore/refund, and update flows. Physical-device QA includes
   location grant/deny/re-enable, keyboard, launcher icon changes, and both widgets.
7. Complete any account-specific closed testing and production-access review.
   [New personal accounts may require 12 testers for 14 continuous days](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Location is optional and foreground-only. Raw coordinates stay on-device; station
IDs/date go to the API and route-demand aggregates are retained. Widget background
requests use saved routes, with no background location. Android backup is disabled.
Google processes payments; purchase verification/ownership is local to the app.
There are no accounts, advertising SDKs, or embedded Android analytics SDKs.
These statements must remain consistent with the shipped manifest, dependencies,
privacy page, and Play declarations.
