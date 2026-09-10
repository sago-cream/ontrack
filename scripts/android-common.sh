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

android_load_env
ANDROID_API_ORIGIN_VALUE="${ANDROID_API_ORIGIN:-https://ontrack.hsichen.dev}"
