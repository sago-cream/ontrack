#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

bash "$ANDROID_ROOT_DIR/scripts/android-common.test.sh"
"$ANDROID_ROOT_DIR/scripts/android-sync.sh"
android_gradle :app:testDebugUnitTest :app:lintDebug

echo "Android unit tests and lint checks passed."
