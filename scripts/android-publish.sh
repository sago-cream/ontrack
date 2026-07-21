#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

if [[ -z "${ANDROID_PUBLISHER_CREDENTIALS:-}" ]]; then
    [[ -n "${PLAY_SERVICE_ACCOUNT_JSON:-}" ]] \
        || android_die "Set ANDROID_PUBLISHER_CREDENTIALS or PLAY_SERVICE_ACCOUNT_JSON."
    [[ -f "$PLAY_SERVICE_ACCOUNT_JSON" ]] \
        || android_die "Play service account JSON not found: $PLAY_SERVICE_ACCOUNT_JSON"
    ANDROID_PUBLISHER_CREDENTIALS="$(<"$PLAY_SERVICE_ACCOUNT_JSON")"
    export ANDROID_PUBLISHER_CREDENTIALS
fi

"$ANDROID_ROOT_DIR/scripts/android-bundle.sh"
android_gradle publishReleaseBundle \
    -PontrackVersionCode="$ANDROID_VERSION_CODE" \
    -PontrackVersionName="$ANDROID_VERSION_NAME"

echo "Uploaded Android $ANDROID_VERSION_NAME ($ANDROID_VERSION_CODE) to the ${PLAY_TRACK:-internal} track with ${PLAY_RELEASE_STATUS:-draft} status."
