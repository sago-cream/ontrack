#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DERIVED_DATA_PATH="${IOS_DERIVED_DATA_PATH:-$IOS_ROOT_DIR/build/DeviceDerivedData}"

DEVICE_ID="${IOS_DEVICE_ID:-}"
if [[ -z "$DEVICE_ID" ]]; then
    DEVICE_ID="$(ios_detect_device_id || true)"
fi

[[ -n "$DEVICE_ID" ]] || ios_die "No connected iOS device found. Connect one, or set IOS_DEVICE_ID."

DESTINATION="${IOS_DESTINATION:-id=$DEVICE_ID}"
APP_PATH="${IOS_APP_PATH:-$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION-iphoneos/$IOS_SCHEME_NAME.app}"

ios_set_provisioning_args

echo "Building $IOS_SCHEME_NAME for device $DEVICE_ID..."
xcodebuild \
    -project "$IOS_PROJECT_PATH" \
    -scheme "$IOS_SCHEME_NAME" \
    -configuration "$CONFIGURATION" \
    -sdk iphoneos \
    -destination "$DESTINATION" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    "${IOS_PROVISIONING_ARGS[@]}" \
    ONTRACK_API_ORIGIN="$IOS_API_ORIGIN_VALUE" \
    build

if [[ ! -d "$APP_PATH" ]]; then
    echo "Built app not found at $APP_PATH." >&2
    echo "Set IOS_APP_PATH if the product name differs from the scheme." >&2
    exit 1
fi

echo "Installing $APP_PATH..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

if [[ "${IOS_SKIP_LAUNCH:-0}" == "1" ]]; then
    echo "Installed $IOS_BUNDLE_ID_VALUE on $DEVICE_ID."
    exit 0
fi

LAUNCH_ARGS=(
    device
    process
    launch
    --device "$DEVICE_ID"
    --terminate-existing
)
if [[ "${IOS_MOCK_DATA:-0}" == "1" ]]; then
    if [[ "$CONFIGURATION" != "Debug" ]]; then
        echo "IOS_MOCK_DATA=1 requires IOS_CONFIGURATION=Debug." >&2
        exit 1
    fi

    LAUNCH_ARGS+=(--environment-variables '{"ONTRACK_MOCK_DATA":"1"}')
fi
LAUNCH_ARGS+=("$IOS_BUNDLE_ID_VALUE")

echo "Launching $IOS_BUNDLE_ID_VALUE..."
xcrun devicectl "${LAUNCH_ARGS[@]}"

echo "Updated and launched $IOS_BUNDLE_ID_VALUE on $DEVICE_ID."
