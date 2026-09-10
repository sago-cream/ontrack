#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ios-common.sh"

CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DERIVED_DATA_ROOT="${IOS_DERIVED_DATA_PATH:-$IOS_ROOT_DIR/build/ScreenshotDerivedData}"
OUTPUT_DIR="${IOS_SCREENSHOT_OUTPUT_DIR:-$IOS_ROOT_DIR/assets/app-store/screenshots}"
SCREENSHOT_PROFILES="${IOS_SCREENSHOT_PROFILES:-iphone69}"
IPHONE_69_DEVICE_NAME="${IOS_SCREENSHOT_IPHONE_69_DEVICE_NAME:-${IOS_SCREENSHOT_DEVICE_NAME:-iPhone 17 Pro Max}}"
IPHONE_69_DEVICE_TYPE="${IOS_SCREENSHOT_IPHONE_69_DEVICE_TYPE:-${IOS_SCREENSHOT_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max}}"
IPHONE_69_EXPECTED_WIDTH="${IOS_SCREENSHOT_IPHONE_69_EXPECTED_WIDTH:-1320}"
IPHONE_69_EXPECTED_HEIGHT="${IOS_SCREENSHOT_IPHONE_69_EXPECTED_HEIGHT:-2868}"
IPHONE_DEVICE_NAME="${IOS_SCREENSHOT_IPHONE_DEVICE_NAME:-${IOS_SCREENSHOT_DEVICE_NAME:-OnTrack 14 Plus Screenshots}}"
IPHONE_DEVICE_TYPE="${IOS_SCREENSHOT_IPHONE_DEVICE_TYPE:-${IOS_SCREENSHOT_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-14-Plus}}"
IPHONE_EXPECTED_WIDTH="${IOS_SCREENSHOT_IPHONE_EXPECTED_WIDTH:-1284}"
IPHONE_EXPECTED_HEIGHT="${IOS_SCREENSHOT_IPHONE_EXPECTED_HEIGHT:-2778}"
IPAD_DEVICE_NAME="${IOS_SCREENSHOT_IPAD_DEVICE_NAME:-OnTrack iPad 13 Screenshots}"
IPAD_DEVICE_TYPE="${IOS_SCREENSHOT_IPAD_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB}"
IPAD_EXPECTED_WIDTH="${IOS_SCREENSHOT_IPAD_EXPECTED_WIDTH:-2064}"
IPAD_EXPECTED_HEIGHT="${IOS_SCREENSHOT_IPAD_EXPECTED_HEIGHT:-2752}"
RUNTIME="${IOS_SCREENSHOT_RUNTIME:-}"

find_screenshot_device() {
    local device_name="$1"

    xcrun simctl list devices available \
        | sed -nE "s/^[[:space:]]*${device_name//\//\\/} \\(([0-9A-F-]+)\\) .*/\\1/p" \
        | head -n 1
}

latest_ios_runtime() {
    xcrun simctl list runtimes available \
        | awk '/iOS .* - com\.apple\.CoreSimulator\.SimRuntime\.iOS-/ { runtime = $NF } END { print runtime }'
}

boot_device() {
    local device_id="$1"

    xcrun simctl boot "$device_id" >/dev/null 2>&1 || true
    xcrun simctl bootstatus "$device_id" -b >/dev/null
}

launch_for_screenshot() {
    local device_id="$1"
    local target="$2"

    xcrun simctl terminate "$device_id" "$IOS_BUNDLE_ID_VALUE" >/dev/null 2>&1 || true

    case "$target" in
        main)
            SIMCTL_CHILD_ONTRACK_SHOWCASE_DATA=1 \
                xcrun simctl launch --terminate-running-process "$device_id" "$IOS_BUNDLE_ID_VALUE" \
                --showcase-data >/dev/null
            ;;
        support)
            SIMCTL_CHILD_ONTRACK_SHOWCASE_DATA=1 \
                SIMCTL_CHILD_ONTRACK_SCREENSHOT_TARGET=support \
                SIMCTL_CHILD_ONTRACK_FRESH_STOREKIT_FLOW=1 \
                SIMCTL_CHILD_ONTRACK_SUPPORTER_DISPLAY_PRICE='NT$60' \
                xcrun simctl launch --terminate-running-process "$device_id" "$IOS_BUNDLE_ID_VALUE" \
                --showcase-data --screenshot-support --fresh-storekit-flow >/dev/null
            ;;
        *)
            ios_die "Unknown screenshot target: $target"
            ;;
    esac
}

capture_image() {
    local device_id="$1"
    local output_path="$2"
    local expected_width="$3"
    local expected_height="$4"
    local width
    local height

    xcrun simctl io "$device_id" screenshot --type=jpeg --mask=ignored "$output_path" >/dev/null
    sips -g pixelWidth -g pixelHeight "$output_path"

    width="$(sips -g pixelWidth "$output_path" | awk '/pixelWidth/ { print $2 }')"
    height="$(sips -g pixelHeight "$output_path" | awk '/pixelHeight/ { print $2 }')"
    [[ "$width" == "$expected_width" && "$height" == "$expected_height" ]] \
        || ios_die "Expected a ${expected_width}x${expected_height} ASC screenshot, got ${width}x${height}: $output_path"
}

set_status_bar() {
    local device_id="$1"
    local profile="$2"
    local args=(
        status_bar "$device_id" override
        --time 9:41
        --dataNetwork wifi
        --wifiBars 3
        --batteryState charged
        --batteryLevel 100
    )

    if [[ "$profile" == iphone* ]]; then
        args+=(--cellularBars 4)
    fi

    xcrun simctl "${args[@]}" >/dev/null
}

capture_profile() {
    local profile="$1"
    local device_name="$2"
    local device_type="$3"
    local expected_width="$4"
    local expected_height="$5"
    local output_prefix="$6"
    local derived_data_path="$DERIVED_DATA_ROOT/$profile"
    local app_path="$derived_data_path/Build/Products/$CONFIGURATION-iphonesimulator/$IOS_SCHEME_NAME.app"
    local device_id
    local main_output
    local support_output

    device_id="$(find_screenshot_device "$device_name")"
    if [[ -z "$device_id" ]]; then
        device_id="$(xcrun simctl create "$device_name" "$device_type" "$RUNTIME")"
    fi

    echo "Building $IOS_SCHEME_NAME for $device_name..."
    xcodebuild \
        -project "$IOS_PROJECT_PATH" \
        -scheme "$IOS_SCHEME_NAME" \
        -configuration "$CONFIGURATION" \
        -sdk iphonesimulator \
        -destination "id=$device_id" \
        -derivedDataPath "$derived_data_path" \
        ONTRACK_API_ORIGIN="$IOS_API_ORIGIN_VALUE" \
        CODE_SIGNING_ALLOWED=NO \
        build >/dev/null

    [[ -d "$app_path" ]] || ios_die "Built app not found at $app_path."

    boot_device "$device_id"
    xcrun simctl uninstall "$device_id" "$IOS_BUNDLE_ID_VALUE" >/dev/null 2>&1 || true
    xcrun simctl install "$device_id" "$app_path"
    set_status_bar "$device_id" "$profile"

    main_output="$OUTPUT_DIR/${output_prefix}-main.jpg"
    support_output="$OUTPUT_DIR/${output_prefix}-support.jpg"

    echo "Capturing $profile main screenshot..."
    launch_for_screenshot "$device_id" main
    sleep 5
    capture_image "$device_id" "$main_output" "$expected_width" "$expected_height"

    echo "Capturing $profile Support OnTrack screenshot..."
    launch_for_screenshot "$device_id" support
    sleep 4
    capture_image "$device_id" "$support_output" "$expected_width" "$expected_height"

    echo "Captured $profile ASC screenshots:"
    echo "  $main_output"
    echo "  $support_output"
}

if [[ "$CONFIGURATION" != "Debug" ]]; then
    ios_die "Screenshot capture requires IOS_CONFIGURATION=Debug."
fi

mkdir -p "$OUTPUT_DIR"

if [[ -z "$RUNTIME" ]]; then
    RUNTIME="$(latest_ios_runtime)"
fi
[[ -n "$RUNTIME" ]] || ios_die "No available iOS simulator runtime found."

for profile in $SCREENSHOT_PROFILES; do
    case "$profile" in
        iphone69)
            capture_profile \
                iphone69 \
                "$IPHONE_69_DEVICE_NAME" \
                "$IPHONE_69_DEVICE_TYPE" \
                "$IPHONE_69_EXPECTED_WIDTH" \
                "$IPHONE_69_EXPECTED_HEIGHT" \
                ontrack-iphone-6-9
            ;;
        iphone)
            capture_profile \
                iphone \
                "$IPHONE_DEVICE_NAME" \
                "$IPHONE_DEVICE_TYPE" \
                "$IPHONE_EXPECTED_WIDTH" \
                "$IPHONE_EXPECTED_HEIGHT" \
                ontrack-iphone-6-5
            ;;
        ipad)
            capture_profile \
                ipad \
                "$IPAD_DEVICE_NAME" \
                "$IPAD_DEVICE_TYPE" \
                "$IPAD_EXPECTED_WIDTH" \
                "$IPAD_EXPECTED_HEIGHT" \
                ontrack-ipad-13
            ;;
        *)
            ios_die "Unknown screenshot profile: $profile"
            ;;
    esac
done
