#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_require_command adb
# Device selection via adb's ANDROID_SERIAL is honored by both adb and Gradle.
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] \
    || android_die "Use an API 33+ emulator for reproducible Play screenshots."
[[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" -ge 33 ]] \
    || android_die "Play screenshot localization requires an API 33+ emulator."
original_size="$(adb shell wm size | tr -d '\r' | sed -n 's/Override size: //p')"
trap 'adb shell wm size "${original_size:-reset}" >/dev/null' EXIT
adb shell wm size 1080x1920
ANDROID_SHOWCASE_MODE=1 "$ANDROID_ROOT_DIR/scripts/android-sync.sh"
for locale in en-US zh-TW; do
    android_gradle :app:connectedDebugAndroidTest \
        -Pandroid.testInstrumentationRunnerArguments.class=dev.hsichen.ontrack.ParityTest#playStoreScreenshots \
        -Pandroid.testInstrumentationRunnerArguments.ontrackLocale="$locale"
    output="$ANDROID_PROJECT_DIR/app/src/main/play/listings/$locale/graphics/phone-screenshots"
    mkdir -p "$output"
    for name in 1-main 2-settings 3-message 4-time; do
        captured="$(find "$ANDROID_PROJECT_DIR/app/build/outputs/connected_android_test_additional_output" -name "$name.png" -print -quit)"
        [[ -n "$captured" ]] || android_die "Missing instrumented screenshot: $name"
        cp "$captured" "$output/$name.png"
    done
done
python3 "$ANDROID_ROOT_DIR/scripts/android-store-check.py"
echo "Captured four Play screenshots per locale at 1080×1920."
