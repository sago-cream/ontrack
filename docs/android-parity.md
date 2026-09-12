# Android parity review — iOS 0.5.1

Baseline: `origin/main` at `5244146`, merged into `feat/android-play-release`
with `696dd7d`. Reference: `ContentView.swift`, shared station/search, theme,
share-message, and widget implementations, plus fresh iOS simulator screenshots.

## Changes

| Area              | Before                                                  | After                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main layout       | Web spacing and heading styles                          | iOS 17/15/12 type hierarchy, centered intrinsic time control, 20px margins, partial route divider, fixed 76px train cards, neutral selection stroke, anchored share panel                          |
| Small phones      | Time and fare columns could collide                     | Compact columns below 380px; checked at 320×640                                                                                                                                                    |
| System chrome     | Theme could disagree with native bars                   | Native WebView/window backgrounds and status/navigation icon brightness follow appearance; bottom inset fallback clears three-button navigation                                                    |
| Train selection   | Rerenders could reset a manual selection                | Preserve selection while the train remains in the visible results; retain latest iOS departure/arrival/deadline behavior                                                                           |
| Settings          | Web language/appearance controls                        | Native section order, theme circles, supporter icons, support/restore controls, update group, linked support/privacy rows; native app language preference and change handling                      |
| Themes and icons  | Three web appearance options                            | System, light, dark, sage, amethyst, ember; five launcher icons; supporter gating                                                                                                                  |
| Message editor    | Generic web presentation                                | Native typography, preview, token pills, preset selection, actual route names; custom templates also flow to widget sharing                                                                        |
| Time sheet        | Generic controls and minute-only clock refresh          | Native segmented control, 216px wheel area, last-train state, footer, 30-second now refresh, Taipei calendar date, wheel alignment after mode changes                                              |
| Station search    | Search-only suggestions                                 | Exact matches, nearby/recommended stations, recent choices, remaining stations; deduplicate, exclude current selection, explicitly search circular Taipei; native full-screen sizing and row icons |
| Location          | One initial request with unstable persistence callbacks | Stable callbacks, foreground/two-minute refresh while enabled, manual-choice protection, permission settings link, circular station exclusion from nearby suggestions                              |
| Interaction       | Browser-only dismissal/sharing                          | Android Back, focus trapping/restoration, sheet swipe dismissal, native share chooser and selection haptics                                                                                        |
| Purchases/updates | No Android equivalent                                   | Play Billing product lookup, signed purchase verification, acknowledgment, restore, pending/error states; Play update availability with per-version dismissal                                      |
| Widgets           | None                                                    | Next Train and Compare Trains, theme palettes, eligibility filter, delay-adjusted times, custom message sharing, cached route and scheduled network refresh                                        |
| Release safety    | Showcase build could leak into a release command        | Signed bundle creation explicitly disables showcase; screenshot/test builds opt into fixtures                                                                                                      |

## Verification

- iOS simulator reference captures: main and support/settings, iPhone 17 Pro Max.
- Android 15 AOSP Pixel 7 emulator, English and Traditional Chinese: main, settings, five theme palettes, message
  editor, time/last-train, station search, manual selection across settings,
  Android Back, and swipe dismissal.
- Both native widget layouts rendered across five palettes. Widget checks cover
  limiting results, stale-date exclusion, and custom message token substitution.
- 51 shared web/backend tests passed. Native connected suite: 4 tests.
- Android debug build, JVM checks and Android lint; shared ESLint and TypeScript
  checks. Screenshots are copied into `docs/assets/android-parity` after the run.

The emulator uses a deterministic showcase route so visual checks do not depend
on the current train schedule. It does not prove production API access or a real
purchase. The public API still returned HTTP 403 to `Origin: https://localhost`
on 2026-09-10. The tested CORS fix is committed on this branch and requires
production deployment (or the equivalent explicit allowed-origin setting).

## Remaining external verification and platform differences

- Configure the Play Console product and `PLAY_BILLING_PUBLIC_KEY`; validate
  purchase, pending/cancellation, restore/refund and updates using a Play
  internal-track installation. The AOSP emulator has no Play Store.
- Verify GPS grant/deny/re-enable, keyboard behavior and launcher icon changes
  on a physical Android device. Foreground location logic is implemented;
  background significant-location tracking is not requested on Android.
- Widget network refresh requests a 15-minute JobScheduler interval and obeys
  Android battery restrictions. An inexact alarm advances cached train selection after departure; Android may
  defer it while idle. Immediate background location changes are not supported.
- Native Android font rendering, navigation chrome, keyboard, share chooser,
  launcher masking and purchase dialogs remain platform-native. Typography
  sizes, spacing, colors, content hierarchy and application controls follow
  the iOS source.

These limitations prevent calling this release fully device/store-verified.

## Captured screens

| Screen   | Android                                                                                                                              | iOS reference                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Main     | [Traditional Chinese](assets/android-parity/android-main-zh-TW.png), [English](assets/android-parity/android-main.png)               | [iOS main](assets/android-parity/ontrack-iphone-6-9-main.jpg)        |
| Settings | [Traditional Chinese](assets/android-parity/android-settings-zh-TW.png), [English](assets/android-parity/android-settings.png)       | [iOS settings](assets/android-parity/ontrack-iphone-6-9-support.jpg) |
| Time     | [Time picker](assets/android-parity/android-time-editor-zh-TW.png), [last train](assets/android-parity/android-last-train-zh-TW.png) | Source: `TimeEditorSheet`                                            |
| Search   | [Station search](assets/android-parity/android-station-search-zh-TW.png)                                                             | Source: station picker                                               |
| Message  | [Editor](assets/android-parity/android-message-editor-zh-TW.png)                                                                     | Source: message editor                                               |
| Widgets  | [Next train](assets/android-parity/widget-train-light.png), [compare trains](assets/android-parity/widget-routes-light.png)          | Source: `TrainWidgetContent.swift`                                   |

All five rendered palettes are retained alongside these captures. The iOS and
Android devices have different logical screen sizes and system chrome; the
shared content measurements are compared in points/dp, not raw screenshot pixels.
