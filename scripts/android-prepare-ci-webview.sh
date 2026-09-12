#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

# API 24's factory WebView predates the browser features used by Next.js.
# Only replace it on the disposable AOSP emulator used by GitHub Actions.
[[ "${CI:-}" == true ]] || android_die "This WebView setup is only for CI emulators."
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || android_die "An emulator is required."
[[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == 24 ]] || android_die "Expected API 24."
[[ "$(adb shell getprop ro.product.cpu.abi | tr -d '\r')" == x86_64 ]] || android_die "Expected x86_64."
android_select_java
android_select_sdk

CACHE="$ANDROID_PROJECT_DIR/.tools/webview-ci-119"
mkdir -p "$CACHE"
python3 - "$CACHE" <<'PY'
import base64, hashlib, pathlib, sys, urllib.request

cache = pathlib.Path(sys.argv[1])
sources = {
    'webview.apk': (
        'https://android.googlesource.com/platform/external/chromium-webview/+/aca588a17000289da9b228d94cc82bd751f91f85/prebuilt/x86_64/webview.apk?format=TEXT',
        'f152c1317fee054a3feb4746ed8028bbe9301c01c51068d65b41ee84e0101949'),
    # AOSP's published test key matches the stock AOSP emulator's development
    # certificate. It is public test data, never an OnTrack release credential.
    'testkey.pk8': (
        'https://android.googlesource.com/platform/build/+/android-7.0.0_r1/target/product/security/testkey.pk8?format=TEXT',
        '495675d32e89a149d5abe191f4e9c0e218b9068714e9b53a7c91e164a0741a23'),
    'testkey.x509.pem': (
        'https://android.googlesource.com/platform/build/+/android-7.0.0_r1/target/product/security/testkey.x509.pem?format=TEXT',
        'a4384ba815b9499a5ce349b4e33c1755278873fe2eac150a068823f526e6dbde'),
}
for name, (url, checksum) in sources.items():
    target = cache / name
    if not target.exists():
        with urllib.request.urlopen(url, timeout=180) as response:
            data = base64.b64decode(response.read(), validate=True)
        if hashlib.sha256(data).hexdigest() != checksum:
            raise SystemExit(f'Unexpected checksum for {name}')
        target.write_bytes(data)
    if hashlib.sha256(target.read_bytes()).hexdigest() != checksum:
        raise SystemExit(f'Unexpected cached checksum for {name}')
PY

# The AOSP system image signs its preinstalled WebView with this same test key.
# Re-signing allows an ordinary package update without changing system files.
"$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
    --key "$CACHE/testkey.pk8" --cert "$CACHE/testkey.x509.pem" \
    --out "$CACHE/webview-emulator.apk" "$CACHE/webview.apk"
adb install -r "$CACHE/webview-emulator.apk"
PROVIDER_RESULT="$(adb shell cmd webviewupdate set-webview-implementation com.android.webview | tr -d '\r')"
[[ "$PROVIDER_RESULT" == Success ]] || android_die "WebView activation failed: $PROVIDER_RESULT"
# API 24 has no dumpsys webviewupdate output. Its switch command returns Success
# only when the requested provider is active; inspect PackageManager for version.
adb shell dumpsys package com.android.webview > "$CACHE/package.txt"
grep -q 'versionName=119.0.6045.141' "$CACHE/package.txt" \
    || android_die "Unexpected installed WebView version."
echo "CI WebView active: com.android.webview 119.0.6045.141"
