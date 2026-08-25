#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

TEST_BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_BUILD_DIR"' EXIT

xcrun swiftc \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/Models.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/DestinationAutofill.swift" \
    "$IOS_ROOT_DIR/apps/ios/Shared/StationChoice.swift" \
    "$IOS_ROOT_DIR/apps/ios/Tests/StationChoiceTests.swift" \
    -o "$TEST_BUILD_DIR/station-choice-tests"

"$TEST_BUILD_DIR/station-choice-tests"

xcrun swiftc \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/Models.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/APIClient.swift" \
    "$IOS_ROOT_DIR/apps/ios/OnTrack/DestinationAutofill.swift" \
    "$IOS_ROOT_DIR/apps/ios/Shared/StationChoice.swift" \
    "$IOS_ROOT_DIR/apps/ios/Shared/ScheduleAcquisition.swift" \
    "$IOS_ROOT_DIR/apps/ios/Tests/ScheduleAcquisitionTests.swift" \
    -o "$TEST_BUILD_DIR/schedule-acquisition-tests"

"$TEST_BUILD_DIR/schedule-acquisition-tests"
