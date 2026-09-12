#!/usr/bin/env bash

ANDROID_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_PROJECT_DIR="$ANDROID_ROOT_DIR/apps/android"

android_die() {
    echo "$*" >&2
    exit 1
}

android_load_env() {
    local env_path="${ANDROID_ENV_FILE:-$ANDROID_ROOT_DIR/.env}"

    if [[ ! -f "$env_path" ]]; then
        return 0
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

android_java_is_supported() {
    local java_major
    java_major="$("$1" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -n 1)"
    [[ "$java_major" =~ ^[0-9]+$ ]] && ((java_major >= 21 && java_major <= 24))
}

android_select_java() {
    if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
        android_java_is_supported "$JAVA_HOME/bin/java" \
            || android_die "JAVA_HOME must point to JDK 21-24."
        return
    fi

    local candidate
    for candidate in \
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
        "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"; do
        if [[ -x "$candidate/bin/java" ]] && android_java_is_supported "$candidate/bin/java"; then
            JAVA_HOME="$candidate"
            export JAVA_HOME
            return
        fi
    done

    if command -v java >/dev/null 2>&1 && android_java_is_supported java; then
        return
    fi

    android_die "Android builds require JDK 21-24. Install OpenJDK 21 or set JAVA_HOME."
}

android_select_sdk() {
    if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME/platforms" ]]; then
        return
    fi

    local candidate
    for candidate in \
        "$HOME/Library/Android/sdk" \
        "/opt/homebrew/share/android-commandlinetools"; do
        if [[ -d "$candidate/platforms" ]]; then
            ANDROID_HOME="$candidate"
            ANDROID_SDK_ROOT="$candidate"
            export ANDROID_HOME
            export ANDROID_SDK_ROOT
            return
        fi
    done

    android_die "Android SDK not found. Set ANDROID_HOME to an SDK containing the platforms directory."
}

android_gradle() {
    android_select_java
    android_select_sdk
    "$ANDROID_PROJECT_DIR/gradlew" -p "$ANDROID_PROJECT_DIR" "$@"
}

android_require_command() {
    command -v "$1" >/dev/null 2>&1 || android_die "Missing required command: $1"
}

android_resolve_release_versions() {
    ANDROID_VERSION_NAME="${ANDROID_VERSION_NAME:-0.2.0}"
    ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-1}"
    [[ "$ANDROID_VERSION_CODE" =~ ^[1-9][0-9]{0,9}$ ]] && ((10#$ANDROID_VERSION_CODE <= 2100000000)) \
        || android_die "ANDROID_VERSION_CODE must be an integer from 1 to 2100000000."
    [[ "$ANDROID_VERSION_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] \
        || android_die "ANDROID_VERSION_NAME must be a semantic version such as 0.2.0."
    export ANDROID_VERSION_NAME ANDROID_VERSION_CODE
}

android_play_config() {
    android_resolve_release_versions
    PLAY_TRACK="${PLAY_TRACK:-internal}"
    PLAY_RELEASE_STATUS="${PLAY_RELEASE_STATUS:-draft}"
    PLAY_VALIDATE_ONLY="${PLAY_VALIDATE_ONLY:-true}"
    case "$PLAY_TRACK" in internal|alpha|beta|production) ;; *) android_die "Invalid PLAY_TRACK." ;; esac
    case "$PLAY_RELEASE_STATUS" in draft|completed) ;; *) android_die "PLAY_RELEASE_STATUS must be draft or completed." ;; esac
    case "$PLAY_VALIDATE_ONLY" in true|false) ;; *) android_die "PLAY_VALIDATE_ONLY must be true or false." ;; esac
    python3 "$ANDROID_ROOT_DIR/scripts/android-play-credentials.py"
    if [[ -z "${ANDROID_PUBLISHER_CREDENTIALS:-}" ]]; then
        ANDROID_PUBLISHER_CREDENTIALS="$(<"$PLAY_SERVICE_ACCOUNT_JSON")"
    fi
    export PLAY_TRACK PLAY_RELEASE_STATUS PLAY_VALIDATE_ONLY ANDROID_PUBLISHER_CREDENTIALS
}

android_clear_play_edit() {
    # GPP retains uncommitted edit IDs between runs. Never reuse a rehearsal edit.
    rm -f "$ANDROID_PROJECT_DIR/app/build/gpp/dev.hsichen.ontrack.txt"*
}

android_load_env
ANDROID_API_ORIGIN_VALUE="${ANDROID_API_ORIGIN:-https://ontrack.hsichen.dev}"
