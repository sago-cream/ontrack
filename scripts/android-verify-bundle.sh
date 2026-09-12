#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"
android_resolve_release_versions
android_select_java
AAB="${ANDROID_AAB_PATH:-$ANDROID_PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab}"
[[ -f "$AAB" ]] || android_die "Release AAB not found. Build the bundle first."
case "${1:-signed}" in
    signed) "${JAVA_HOME:+$JAVA_HOME/bin/}java" "$ANDROID_ROOT_DIR/scripts/AndroidSigningCheck.java" bundle "$AAB" ;;
    allow-unsigned) ;;
    *) android_die "Usage: android-verify-bundle.sh [signed|allow-unsigned]" ;;
esac

BUNDLETOOL="$ANDROID_PROJECT_DIR/.tools/bundletool-1.18.3.jar"
BUNDLETOOL_SHA256=a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29
mkdir -p "$(dirname "$BUNDLETOOL")"
if [[ ! -f "$BUNDLETOOL" ]]; then
    curl --fail --location --retry 3 --output "$BUNDLETOOL.download" \
        https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar
    mv "$BUNDLETOOL.download" "$BUNDLETOOL"
fi
python3 - "$BUNDLETOOL" "$BUNDLETOOL_SHA256" <<'PY'
import hashlib, pathlib, sys
if hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest() != sys.argv[2]:
    sys.exit('bundletool checksum mismatch. Remove apps/android/.tools/bundletool-1.18.3.jar and retry.')
PY
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -jar "$BUNDLETOOL" validate --bundle="$AAB" > /dev/null
MANIFEST="$(mktemp)"
CONFIG="$(mktemp)"
trap 'rm -f "$MANIFEST" "$CONFIG"' EXIT
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -jar "$BUNDLETOOL" dump manifest --bundle="$AAB" > "$MANIFEST"
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -jar "$BUNDLETOOL" dump config --bundle="$AAB" > "$CONFIG"
python3 "$ANDROID_ROOT_DIR/scripts/android-bundle-check.py" "$AAB" "$MANIFEST" "$CONFIG"
