#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

SDK_PATH="${IOS_SIMULATOR_SDK_PATH:-$(xcrun --sdk iphonesimulator --show-sdk-path)}"
TARGET="${IOS_PARSE_TARGET:-arm64-apple-ios17.0-simulator}"
DESTINATION_AUTOFILL_CONFIG="$IOS_ROOT_DIR/apps/shared/destination-autofill.json"
PROJECT_FILE="$IOS_PROJECT_PATH/project.pbxproj"

xcodebuild -list -project "$IOS_PROJECT_PATH" >/dev/null
ios_assert_iphone_only_ios_project
[[ -f "$DESTINATION_AUTOFILL_CONFIG" ]] \
    || ios_die "Missing destination autofill config: $DESTINATION_AUTOFILL_CONFIG"
python3 -m json.tool "$DESTINATION_AUTOFILL_CONFIG" >/dev/null \
    || ios_die "Invalid destination autofill JSON: $DESTINATION_AUTOFILL_CONFIG"
grep -q "../shared/destination-autofill.json" "$PROJECT_FILE" \
    || ios_die "OnTrack project is not linked to the shared destination autofill config."
grep -q "destination-autofill.json in Resources" "$PROJECT_FILE" \
    || ios_die "Destination autofill config is not listed in the OnTrack resources build phase."
xcrun swiftc \
    -sdk "$SDK_PATH" \
    -target "$TARGET" \
    -parse \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/APIClient.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/ContentView.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/DestinationAutofill.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/Models.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/OnTrackApp.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/UpdateAvailabilityManager.swift"

echo "iOS project and Swift parse checks passed for scheme $IOS_SCHEME_NAME."
