#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_resolve_release_versions
# Candidates must be reproducible without loading local upload credentials.
export ANDROID_KEYSTORE_PATH='' ANDROID_KEYSTORE_PASSWORD='' ANDROID_KEY_ALIAS='' ANDROID_KEY_PASSWORD=''
export ANDROID_SHOWCASE_MODE=0
python3 "$ANDROID_ROOT_DIR/scripts/android-store-check.py"
"$ANDROID_ROOT_DIR/scripts/android-check.sh"
android_gradle :app:assembleDebug :app:bundleRelease :app:lintRelease
"$ANDROID_ROOT_DIR/scripts/android-verify-bundle.sh" allow-unsigned
echo "Debug APK and unsigned release candidate verified; the candidate cannot be uploaded to Play."
