#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_play_config
PLAY_SOURCE_TRACK="${PLAY_SOURCE_TRACK:-internal}"
case "$PLAY_SOURCE_TRACK" in internal|alpha|beta) ;; *) android_die "PLAY_SOURCE_TRACK must be internal, alpha, or beta." ;; esac
[[ "$PLAY_SOURCE_TRACK" != "$PLAY_TRACK" ]] || android_die "Choose different source and destination tracks."
python3 "$ANDROID_ROOT_DIR/scripts/android-policy-check.py"
android_clear_play_edit
trap android_clear_play_edit EXIT
android_gradle promoteReleaseArtifact --from-track "$PLAY_SOURCE_TRACK" --promote-track "$PLAY_TRACK" --version-code "$ANDROID_VERSION_CODE"
echo "Play promotion requested for version $ANDROID_VERSION_CODE: $PLAY_SOURCE_TRACK → $PLAY_TRACK; validate only: $PLAY_VALIDATE_ONLY."
