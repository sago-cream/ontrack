#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
SDK="${IOS_SDK:-iphonesimulator}"
DESTINATION="${IOS_DESTINATION:-generic/platform=iOS Simulator}"
DERIVED_DATA_PATH="${IOS_DERIVED_DATA_PATH:-$IOS_ROOT_DIR/build/DerivedData}"

xcodebuild \
    -project "$IOS_PROJECT_PATH" \
    -scheme "$IOS_SCHEME_NAME" \
    -configuration "$CONFIGURATION" \
    -sdk "$SDK" \
    -destination "$DESTINATION" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    ONTRACK_API_ORIGIN="$IOS_API_ORIGIN_VALUE" \
    CODE_SIGNING_ALLOWED=NO \
    build

ios_assert_iphone_only_ios_app "$(ios_built_app_path "$DERIVED_DATA_PATH" "$CONFIGURATION" "$SDK")"
