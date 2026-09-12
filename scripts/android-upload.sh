#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_play_config
python3 "$ANDROID_ROOT_DIR/scripts/android-store-check.py"
# Verify and upload exactly one existing artifact; never rebuild after archiving it.
export ANDROID_AAB_PATH="${ANDROID_AAB_PATH:-$ANDROID_PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab}"
ANDROID_REQUIRE_BILLING=1 "$ANDROID_ROOT_DIR/scripts/android-verify-bundle.sh"
python3 "$ANDROID_ROOT_DIR/scripts/android-policy-check.py"
android_clear_play_edit
trap android_clear_play_edit EXIT
android_gradle publishReleaseBundle --artifact-dir "$ANDROID_AAB_PATH" publishReleaseListing
if [[ "$PLAY_VALIDATE_ONLY" == true ]]; then
    echo "Play validated Android $ANDROID_VERSION_CODE; the edit was not committed."
else
    echo "Uploaded Android $ANDROID_VERSION_CODE to $PLAY_TRACK with $PLAY_RELEASE_STATUS status."
fi
