#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

android_require_command bun

cd "$ANDROID_ROOT_DIR"
NEXT_PUBLIC_ONTRACK_API_ORIGIN="$ANDROID_API_ORIGIN_VALUE" \
    NEXT_PUBLIC_ONTRACK_SHOWCASE_MODE="${ANDROID_SHOWCASE_MODE:-0}" \
    bun run --filter @ontrack/web build
bunx cap sync android

echo "Android web assets and native dependencies are synchronized."
