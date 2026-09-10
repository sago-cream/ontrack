#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

required_signing_variables=(
    ANDROID_KEYSTORE_PATH
    ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_ALIAS
    ANDROID_KEY_PASSWORD
)

for variable_name in "${required_signing_variables[@]}"; do
    [[ -n "${!variable_name:-}" ]] || android_die "Missing required release variable: $variable_name"
done

[[ -f "$ANDROID_KEYSTORE_PATH" ]] || android_die "Keystore not found: $ANDROID_KEYSTORE_PATH"
[[ "${ANDROID_VERSION_CODE:-}" =~ ^[1-9][0-9]*$ ]] \
    || android_die "ANDROID_VERSION_CODE must be a positive integer."
[[ "${ANDROID_VERSION_NAME:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] \
    || android_die "ANDROID_VERSION_NAME must be a semantic version such as 0.2.0."

ANDROID_SHOWCASE_MODE=0 "$ANDROID_ROOT_DIR/scripts/android-sync.sh"
android_gradle bundleRelease \
    -PontrackVersionCode="$ANDROID_VERSION_CODE" \
    -PontrackVersionName="$ANDROID_VERSION_NAME"

bundle_path="$ANDROID_PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab"
[[ -f "$bundle_path" ]] || android_die "Release bundle was not created: $bundle_path"

echo "Signed Android App Bundle: $bundle_path"
