#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

android_require_command adb
ANDROID_SHOWCASE_MODE=1 "$ANDROID_ROOT_DIR/scripts/android-sync.sh"

if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit !found }'; then
    android_die "No unlocked Android device or running emulator is available."
fi

android_gradle :app:connectedDebugAndroidTest

echo "Android instrumented tests passed."
