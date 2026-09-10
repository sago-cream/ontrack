#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

CONFIGURATION="${IOS_CONFIGURATION:-Release}"
ARCHIVE_PATH="${IOS_ARCHIVE_PATH:-$IOS_ROOT_DIR/build/archive/OnTrack.xcarchive}"
ios_resolve_release_versions
MARKETING_VERSION="$IOS_MARKETING_VERSION"
BUILD_NUMBER="$IOS_BUILD_NUMBER"

[[ -n "${APPLE_TEAM_ID:-}" ]] || ios_die "APPLE_TEAM_ID is required for signing an iOS archive."
ios_set_app_store_auth_args
ios_set_provisioning_args

mkdir -p "$(dirname "$ARCHIVE_PATH")"

XCODEBUILD_ARGS=(
    archive
    -project "$IOS_PROJECT_PATH"
    -scheme "$IOS_SCHEME_NAME"
    -configuration "$CONFIGURATION"
    -destination "generic/platform=iOS"
    -archivePath "$ARCHIVE_PATH"
    ${IOS_PROVISIONING_ARGS[@]+"${IOS_PROVISIONING_ARGS[@]}"}
    ${APP_STORE_AUTH_ARGS[@]+"${APP_STORE_AUTH_ARGS[@]}"}
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID"
    ONTRACK_API_ORIGIN="$IOS_API_ORIGIN_VALUE"
    MARKETING_VERSION="$MARKETING_VERSION"
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER"
)

xcodebuild "${XCODEBUILD_ARGS[@]}"
ios_assert_iphone_only_ios_app "$ARCHIVE_PATH/Products/Applications/$IOS_SCHEME_NAME.app"

echo "Archive written to $ARCHIVE_PATH"
