#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

android_require_command adb

if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit !found }'; then
    android_die "No unlocked Android device or running emulator is available."
fi

locale="${ANDROID_SCREENSHOT_LOCALE:-en-US}"
name="${ANDROID_SCREENSHOT_NAME:-1-main.png}"
output_dir="$ANDROID_PROJECT_DIR/app/src/main/play/listings/$locale/graphics/phone-screenshots"
output_path="$output_dir/$name"

ANDROID_SHOWCASE_MODE=1 "$ANDROID_ROOT_DIR/scripts/android-sync.sh"
android_gradle installDebug
adb shell am force-stop dev.hsichen.ontrack
adb shell am start -W \
    -n dev.hsichen.ontrack/.MainActivity \
    -d 'https://localhost/app.html?showcase' >/dev/null
sleep 2
mkdir -p "$output_dir"
adb exec-out screencap -p >"$output_path"

echo "Captured Play Store screenshot: $output_path"
