#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DERIVED_DATA_PATH="${IOS_DERIVED_DATA_PATH:-$IOS_ROOT_DIR/build/SimulatorDerivedData}"
PRESERVE_APP_DATA="${IOS_PRESERVE_APP_DATA:-1}"
DEVICE_ID="${IOS_SIMULATOR_ID:-}"
DEVICE_NAME="${IOS_SIMULATOR_NAME:-}"
APP_PATH="${IOS_APP_PATH:-$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION-iphonesimulator/$IOS_SCHEME_NAME.app}"

if [[ "${IOS_MOCK_DATA:-0}" == "1" && "$CONFIGURATION" != "Debug" ]]; then
    ios_die "IOS_MOCK_DATA=1 requires IOS_CONFIGURATION=Debug."
fi

find_simulator_id() {
    local state_pattern="$1"
    local name="$2"

    xcrun simctl list devices available \
        | awk -v state_pattern="$state_pattern" -v name="$name" '
            /^[[:space:]]+iPhone/ && (name == "" || index($0, name " (") > 0) && (state_pattern == "" || $0 ~ state_pattern) {
                if (match($0, /\([0-9A-F-]+\)/)) {
                    print substr($0, RSTART + 1, RLENGTH - 2)
                    exit
                }
            }
        '
}

if [[ -z "$DEVICE_ID" ]]; then
    DEVICE_ID="$(find_simulator_id '\(Booted\)' "$DEVICE_NAME")"
fi

if [[ -z "$DEVICE_ID" ]]; then
    DEVICE_ID="$(find_simulator_id '' "$DEVICE_NAME")"
fi

if [[ -z "$DEVICE_ID" && -n "$DEVICE_NAME" ]]; then
    ios_die "No available iPhone simulator named '$DEVICE_NAME' found."
fi

[[ -n "$DEVICE_ID" ]] || ios_die "No available iPhone simulator found. Install an iOS simulator runtime, or set IOS_SIMULATOR_ID."

echo "Booting simulator $DEVICE_ID..."
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_ID" -b

if [[ "${IOS_SKIP_OPEN:-0}" != "1" ]]; then
    open -a Simulator
fi

echo "Building $IOS_SCHEME_NAME for simulator $DEVICE_ID..."
xcodebuild \
    -project "$IOS_PROJECT_PATH" \
    -scheme "$IOS_SCHEME_NAME" \
    -configuration "$CONFIGURATION" \
    -sdk iphonesimulator \
    -destination "id=$DEVICE_ID" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    ONTRACK_API_ORIGIN="$IOS_API_ORIGIN_VALUE" \
    CODE_SIGNING_ALLOWED=NO \
    build

if [[ ! -d "$APP_PATH" ]]; then
    echo "Built app not found at $APP_PATH." >&2
    echo "Set IOS_APP_PATH if the product name differs from the scheme." >&2
    exit 1
fi

ios_assert_universal_ios_app "$APP_PATH"
xcrun simctl terminate "$DEVICE_ID" "$IOS_BUNDLE_ID_VALUE" >/dev/null 2>&1 || true

if [[ "$PRESERVE_APP_DATA" != "1" ]]; then
    echo "Removing existing $IOS_BUNDLE_ID_VALUE to clear cached app state..."
    xcrun simctl uninstall "$DEVICE_ID" "$IOS_BUNDLE_ID_VALUE" >/dev/null 2>&1 || true
fi

echo "Installing $APP_PATH..."
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

if [[ "${IOS_SKIP_LAUNCH:-0}" == "1" ]]; then
    echo "Installed $IOS_BUNDLE_ID_VALUE on simulator $DEVICE_ID."
    exit 0
fi

echo "Launching $IOS_BUNDLE_ID_VALUE..."
if [[ "${IOS_MOCK_DATA:-0}" == "1" ]]; then
    SIMCTL_CHILD_ONTRACK_MOCK_DATA=1 \
        xcrun simctl launch --terminate-running-process "$DEVICE_ID" "$IOS_BUNDLE_ID_VALUE"
else
    xcrun simctl launch --terminate-running-process "$DEVICE_ID" "$IOS_BUNDLE_ID_VALUE"
fi

echo "Updated and launched $IOS_BUNDLE_ID_VALUE on simulator $DEVICE_ID."
