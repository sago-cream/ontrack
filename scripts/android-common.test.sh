#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
printf 'ANDROID_API_ORIGIN=https://example.com\n' > "$test_dir/android.env"

origin="$(env -u ANDROID_API_ORIGIN ANDROID_ENV_FILE="$test_dir/android.env" bash -c 'source "$1/scripts/android-common.sh"; printf "%s" "$ANDROID_API_ORIGIN_VALUE"' _ "$root_dir")"
[[ "$origin" == https://example.com ]]
origin="$(ANDROID_API_ORIGIN=https://override.example.com ANDROID_ENV_FILE="$test_dir/android.env" bash -c 'source "$1/scripts/android-common.sh"; printf "%s" "$ANDROID_API_ORIGIN_VALUE"' _ "$root_dir")"
[[ "$origin" == https://override.example.com ]]
origin="$(env -u ANDROID_API_ORIGIN ANDROID_ENV_FILE="$test_dir/missing.env" bash -c 'source "$1/scripts/android-common.sh"; printf "%s" "$ANDROID_API_ORIGIN_VALUE"' _ "$root_dir")"
[[ "$origin" == https://ontrack.hsichen.dev ]]

mkdir -p "$test_dir/jdk with spaces/bin"
for version in 17 21 24 25; do
    printf '#!/bin/sh\necho '\''openjdk version "%s.0.1"'\'' >&2\n' "$version" > "$test_dir/jdk with spaces/bin/java"
    chmod +x "$test_dir/jdk with spaces/bin/java"
    if JAVA_HOME="$test_dir/jdk with spaces" ANDROID_ENV_FILE="$test_dir/missing.env" bash -c 'source "$1/scripts/android-common.sh"; android_select_java' _ "$root_dir" >/dev/null 2>&1; then
        [[ "$version" == 21 || "$version" == 24 ]]
    else
        [[ "$version" == 17 || "$version" == 25 ]]
    fi
done

echo 'Android environment tests passed.'
