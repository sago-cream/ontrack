#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_resolve_release_versions
android_select_java
"${JAVA_HOME:+$JAVA_HOME/bin/}java" "$ANDROID_ROOT_DIR/scripts/AndroidSigningCheck.java" signing "$ANDROID_PROJECT_DIR"
if [[ -n "${PLAY_BILLING_PUBLIC_KEY:-}" ]]; then
    "${JAVA_HOME:+$JAVA_HOME/bin/}java" "$ANDROID_ROOT_DIR/scripts/AndroidSigningCheck.java" billing "$ANDROID_PROJECT_DIR"
fi
python3 "$ANDROID_ROOT_DIR/scripts/android-store-check.py"
ANDROID_SHOWCASE_MODE=0 "$ANDROID_ROOT_DIR/scripts/android-sync.sh"
android_gradle :app:bundleRelease :app:lintRelease
# Always verify the artifact just built, independent of a caller's upload-path override.
ANDROID_AAB_PATH="$ANDROID_PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab" \
    "$ANDROID_ROOT_DIR/scripts/android-verify-bundle.sh"
echo "Signed Android App Bundle: $ANDROID_PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab"
