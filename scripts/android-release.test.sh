#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_select_java
if [[ -n "${JAVA_HOME:-}" ]]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
bash "$ANDROID_ROOT_DIR/scripts/android-common.test.sh"
python3 -m unittest discover -s "$ANDROID_ROOT_DIR/scripts/tests" -p 'test_android_*.py'
