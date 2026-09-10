# Android and Google Play releases

OnTrack's Android app is a Capacitor 8 container around the statically exported
web app. The native project lives in `apps/android`, opens the bundled
`/app.html` route, and targets Android 16 (API 36).

## Prerequisites

- Bun 1.3.9 or newer
- JDK 21 (JDK 21 through 24 is accepted by the scripts)
- Android SDK Platform 36 and Build Tools 36.0.0
- `adb` for device, emulator, and screenshot commands
- A Play Console app using package ID `dev.hsichen.ontrack`

Install dependencies and synchronize the exported web app:

```sh
bun install
bun run android:sync
```

Set `ANDROID_API_ORIGIN` when a native build should use another HTTPS backend.
Cleartext HTTP is disabled in the production manifest. The bundled WebView sends
`Origin: https://localhost`; the API must allow that exact origin. Deploy the
worker's Android CORS change before testing against production, or add
`https://localhost` to the backend's `CORS_ALLOWED_ORIGINS` configuration.

## Development and tests

Run the local JVM tests and Android lint:

```sh
bun run android:check
```

Install and launch a debug build on an unlocked device or running emulator:

```sh
bun run android
```

Run the instrumented launch and bundled-route tests:

```sh
bun run android:test:device
```

The Android GitHub Actions workflow runs lint, JVM tests, and API 35 emulator
tests for Android or shared-web changes.

## Upload signing

Create one upload keystore and back it up securely. Do not commit it:

```sh
keytool -genkeypair \
  -keystore ontrack-upload.jks \
  -alias ontrack-upload \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Copy `.env.android.example` values into the ignored root `.env`, or export the
variables in the shell. All four signing values are required together:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Every upload needs a new positive `ANDROID_VERSION_CODE`. The user-facing
`ANDROID_VERSION_NAME` must use a semantic version such as `0.2.0`.

Create a checked, signed Android App Bundle:

```sh
bun run android:release
```

The bundle is written to
`apps/android/app/build/outputs/bundle/release/app-release.aab`.

## Play Console setup

1. Create the Play Console app with package ID `dev.hsichen.ontrack`.
2. Complete app access, ads, content rating, target audience, news-app, and
   government-app declarations.
3. Use `https://ontrack.hsichen.dev/docs/privacy` for the privacy policy and
   `https://ontrack.hsichen.dev/docs/support` for support.
4. Enroll in Play App Signing and manually upload the first signed AAB. Google
   requires the initial release before API-based publishing can manage later
   releases.
5. Enable the Google Play Android Developer API in the linked Google Cloud
   project, create a service account, and grant it release permissions in Play
   Console.
6. Store its JSON outside the repository and set `PLAY_SERVICE_ACCOUNT_JSON`,
   or place the JSON content directly in `ANDROID_PUBLISHER_CREDENTIALS`.

The checked-in English and Traditional Chinese listings, release notes, icon,
and feature graphic are under `apps/android/app/src/main/play`. Emulator
screenshots can be captured directly into that structure:

```sh
ANDROID_SCREENSHOT_LOCALE=en-US \
ANDROID_SCREENSHOT_NAME=1-main.png \
bun run android:screenshots
```

Run the same command on the intended phone and tablet emulator profiles and
use the appropriate Play graphics folder when collecting tablet images.

## Publish

Uploads default to an internal-track draft. This is intentionally the safest
release posture:

```sh
bun run android:publish
```

Override it only for an intentional promotion:

```sh
PLAY_TRACK=production PLAY_RELEASE_STATUS=completed bun run android:publish
```

Supported Gradle Play Publisher statuses include `draft`, `completed`,
`in_progress`, and `halted`. Production publishing is an external state change;
review the generated AAB, store listing, Data safety answers, and device catalog
before using `completed`.

## Privacy and policy checklist

Before every public release, verify these answers against the shipped build:

- Location is optional, foreground-only, and used to choose a nearby station.
- Both approximate and precise location permissions are declared; users can
  continue by choosing an origin manually when permission is denied.
- Raw coordinates are not stored in the OnTrack application database.
- Network access retrieves railway data from the configured OnTrack API.
- No account, advertising SDK, or background location access is present.
- The Data safety form, privacy policy, support page, screenshots, and release
  notes describe the current behavior.
