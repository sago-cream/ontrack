#!/usr/bin/env bash

APP_STORE_AUTH_ARGS=()
IOS_PROVISIONING_ARGS=()

IOS_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_PROJECT_PATH="${IOS_PROJECT:-$IOS_ROOT_DIR/apps/ios/OnTrack.xcodeproj}"
IOS_SCHEME_NAME="${IOS_SCHEME:-OnTrack}"
IOS_BUNDLE_ID_VALUE="${IOS_BUNDLE_ID:-dev.hsichen.ontrack}"
IOS_API_ORIGIN_VALUE="${IOS_API_ORIGIN:-https://ontrack.hsichen.dev}"

ios_load_env() {
    local env_path="${IOS_ENV_FILE:-$IOS_ROOT_DIR/.env}"

    if [[ ! -f "$env_path" ]]; then
        return
    fi

    local line
    local key
    local value

    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue

        key="${line%%=*}"
        value="${line#*=}"

        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        [[ -z "${!key+x}" ]] || continue

        printf -v "$key" '%s' "$value"
        export "$key"
    done <"$env_path"
}

ios_load_env

ios_die() {
    echo "$*" >&2
    exit 1
}

ios_project_build_setting() {
    local setting_name="$1"
    local fallback="$2"
    local project_file="$IOS_PROJECT_PATH/project.pbxproj"

    if [[ ! -f "$project_file" ]]; then
        printf '%s\n' "$fallback"
        return
    fi

    local setting_value
    setting_value="$(
        awk -F= -v key="$setting_name" '
            $1 ~ key {
                gsub(/[;[:space:]]/, "", $2)
                print $2
                exit
            }
        ' "$project_file"
    )"

    printf '%s\n' "${setting_value:-$fallback}"
}

ios_assert_project_build_setting_equals() {
    local setting_name="$1"
    local expected_value="$2"
    local project_file="$IOS_PROJECT_PATH/project.pbxproj"

    [[ -f "$project_file" ]] || ios_die "Missing Xcode project file: $project_file"

    local invalid_values
    invalid_values="$(
        awk -F= -v key="$setting_name" -v expected="$expected_value" '
            {
                lhs = $1
                gsub(/[[:space:]]/, "", lhs)

                if (lhs != key) {
                    next
                }

                value = $2
                gsub(/[;"]/, "", value)
                gsub(/[[:space:]]/, "", value)
                count += 1

                if (value != expected) {
                    printf "%s%s", separator, value
                    separator = ", "
                }
            }

            END {
                if (count == 0) {
                    print "__MISSING__"
                }
            }
        ' "$project_file"
    )"

    if [[ "$invalid_values" == "__MISSING__" ]]; then
        ios_die "Missing required iOS build setting $setting_name=$expected_value."
    fi

    if [[ -n "$invalid_values" ]]; then
        ios_die "Expected $setting_name=$expected_value for every iOS build configuration, found: $invalid_values."
    fi
}

ios_assert_iphone_only_ios_project() {
    ios_assert_project_build_setting_equals TARGETED_DEVICE_FAMILY 1
    ios_assert_project_build_setting_equals SUPPORTS_MACCATALYST NO
    ios_assert_project_build_setting_equals SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD NO
    ios_assert_project_build_setting_equals SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD NO
}

ios_sdk_product_suffix() {
    local sdk="$1"

    case "$sdk" in
        iphonesimulator*)
            printf 'iphonesimulator\n'
            ;;
        iphoneos*)
            printf 'iphoneos\n'
            ;;
        *)
            printf '%s\n' "$sdk"
            ;;
    esac
}

ios_built_app_path() {
    local derived_data_path="$1"
    local configuration="$2"
    local sdk="$3"
    local product_name="${4:-$IOS_SCHEME_NAME}"
    local platform_suffix

    platform_suffix="$(ios_sdk_product_suffix "$sdk")"
    printf '%s/Build/Products/%s-%s/%s.app\n' \
        "$derived_data_path" \
        "$configuration" \
        "$platform_suffix" \
        "$product_name"
}

ios_app_device_family() {
    local app_path="$1"
    local info_plist="$app_path/Info.plist"

    [[ -f "$info_plist" ]] || ios_die "Missing built app Info.plist: $info_plist"

    local device_family_json
    device_family_json="$(plutil -extract UIDeviceFamily json -o - "$info_plist" 2>/dev/null || true)"
    printf '%s\n' "$device_family_json" | tr -d '[][:space:]' | tr ',' '\n' | sed '/^$/d' | sort -n | paste -sd, -
}

ios_assert_iphone_only_ios_app() {
    local app_path="$1"
    local normalized_device_family
    normalized_device_family="$(ios_app_device_family "$app_path")"

    if [[ "$normalized_device_family" != "1" ]]; then
        ios_die "Expected built app UIDeviceFamily to be iPhone-only (1), found: ${normalized_device_family:-missing}."
    fi
}

ios_next_build_number() {
    local build_number="$1"

    if [[ "$build_number" =~ ^[0-9]+$ ]]; then
        printf '%s\n' "$((build_number + 1))"
        return
    fi

    printf '%s\n' "$build_number"
}

ios_resolve_release_versions() {
    local project_marketing_version
    local project_build_number

    project_marketing_version="$(ios_project_build_setting MARKETING_VERSION "0.1.0")"
    project_build_number="$(ios_project_build_setting CURRENT_PROJECT_VERSION "1")"

    IOS_MARKETING_VERSION="${IOS_MARKETING_VERSION:-$project_marketing_version}"
    IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-$project_build_number}"

    if [[ "${IOS_RELEASE_PROMPT:-0}" == "1" && -t 0 ]]; then
        local prompted_value
        local suggested_build_number
        suggested_build_number="$(ios_next_build_number "$project_build_number")"

        read -r -p "Marketing version [$IOS_MARKETING_VERSION]: " prompted_value
        IOS_MARKETING_VERSION="${prompted_value:-$IOS_MARKETING_VERSION}"

        read -r -p "Build number [$suggested_build_number]: " prompted_value
        IOS_BUILD_NUMBER="${prompted_value:-$suggested_build_number}"
    fi

    export IOS_MARKETING_VERSION
    export IOS_BUILD_NUMBER
}

ios_set_app_store_auth_args() {
    APP_STORE_AUTH_ARGS=()

    if [[ -z "${ASC_KEY_PATH:-}${ASC_KEY_ID:-}${ASC_ISSUER_ID:-}" ]]; then
        return
    fi

    if [[ -z "${ASC_KEY_PATH:-}" || -z "${ASC_KEY_ID:-}" || -z "${ASC_ISSUER_ID:-}" ]]; then
        ios_die "ASC_KEY_PATH, ASC_KEY_ID, and ASC_ISSUER_ID must be set together."
    fi

    APP_STORE_AUTH_ARGS=(
        -authenticationKeyPath "$ASC_KEY_PATH"
        -authenticationKeyID "$ASC_KEY_ID"
        -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    )
}

ios_set_provisioning_args() {
    IOS_PROVISIONING_ARGS=()

    if [[ "${IOS_ALLOW_PROVISIONING_UPDATES:-1}" != "0" ]]; then
        IOS_PROVISIONING_ARGS=(-allowProvisioningUpdates)
    fi
}

ios_detect_device_id() {
    local devices_json
    devices_json="$(mktemp)"
    local devicectl_args=(list devices --json-output "$devices_json")

    if [[ -n "${IOS_DEVICECTL_TIMEOUT_SECONDS:-}" ]]; then
        devicectl_args+=(--timeout "$IOS_DEVICECTL_TIMEOUT_SECONDS")
    fi

    if ! xcrun devicectl "${devicectl_args[@]}" >/dev/null; then
        rm -f "$devices_json"
        return 1
    fi

    local device_count
    device_count="$(plutil -extract result.devices raw -o - "$devices_json" 2>/dev/null || true)"

    local device_id=""
    local fallback_device_id=""
    local index=0
    local pairing_state
    local tunnel_state
    local udid

    while [[ "$device_count" =~ ^[0-9]+$ && "$index" -lt "$device_count" ]]; do
        udid="$(plutil -extract "result.devices.$index.hardwareProperties.udid" raw -o - "$devices_json" 2>/dev/null || true)"

        if [[ -n "$udid" && -z "$fallback_device_id" ]]; then
            fallback_device_id="$udid"
        fi

        pairing_state="$(plutil -extract "result.devices.$index.connectionProperties.pairingState" raw -o - "$devices_json" 2>/dev/null || true)"
        tunnel_state="$(plutil -extract "result.devices.$index.connectionProperties.tunnelState" raw -o - "$devices_json" 2>/dev/null || true)"

        if [[ -n "$udid" && "$pairing_state" == "paired" && "$tunnel_state" != "unavailable" ]]; then
            device_id="$udid"
            break
        fi

        index="$((index + 1))"
    done

    device_id="${device_id:-$fallback_device_id}"
    rm -f "$devices_json"

    [[ -n "$device_id" ]] && printf '%s\n' "$device_id"
}

ios_write_export_options_plist() {
    local output_path="$1"
    local team_id_block=""
    local team_id="${IOS_EXPORT_TEAM_ID_VALUE:-${APPLE_TEAM_ID:-}}"

    if [[ -n "$team_id" ]]; then
        team_id_block="
    <key>teamID</key>
    <string>${team_id}</string>"
    fi

    cat >"$output_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>${IOS_EXPORT_METHOD_VALUE}</string>
    <key>destination</key>
    <string>${IOS_EXPORT_DESTINATION_VALUE}</string>
    <key>signingStyle</key>
    <string>${IOS_SIGNING_STYLE_VALUE}</string>${team_id_block}
    <key>stripSwiftSymbols</key>
    <${IOS_STRIP_SWIFT_SYMBOLS_VALUE}/>
    <key>uploadSymbols</key>
    <${IOS_UPLOAD_SYMBOLS_VALUE}/>
</dict>
</plist>
PLIST
}
