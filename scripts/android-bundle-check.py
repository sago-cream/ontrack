#!/usr/bin/env python3
"""Check the actual bundle manifest and native ELF alignment, then record release provenance."""
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
from urllib.parse import urlsplit


def check_bundle(aab, manifest, config):
    android = '{http://schemas.android.com/apk/res/android}'
    root = ET.parse(manifest).getroot()
    package = root.get('package')
    if package != 'dev.hsichen.ontrack':
        raise ValueError('Bundle package must be dev.hsichen.ontrack (never the debug package).')
    code = root.get(android + 'versionCode')
    name = root.get(android + 'versionName')
    if code != os.environ.get('ANDROID_VERSION_CODE', '1') or name != os.environ.get('ANDROID_VERSION_NAME', '0.2.0'):
        raise ValueError('Bundle version does not match ANDROID_VERSION_CODE / ANDROID_VERSION_NAME.')
    sdk = root.find('uses-sdk')
    if sdk is None or int(sdk.get(android + 'targetSdkVersion', '0')) < 36:
        raise ValueError('Play releases must target API 36 or later.')
    app = root.find('application')
    if app is None or app.get(android + 'debuggable') == 'true':
        raise ValueError('Release application is missing or debuggable.')
    if app.get(android + 'allowBackup') != 'false' or app.get(android + 'usesCleartextTraffic') != 'false':
        raise ValueError('Release must disable backup and cleartext traffic.')
    permissions = [item.get(android + 'name') for item in root if item.tag.startswith('uses-permission')]
    # Match the merged OnTrack/Capacitor/Play manifest; no background location or advertising ID.
    allowed = {package + '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
               'android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET',
               'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION',
               'com.android.vending.BILLING', 'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
               'android.permission.RECEIVE_BOOT_COMPLETED'}
    if set(permissions) - allowed:
        raise ValueError('New app permissions require a review of the privacy policy and Play declarations.')
    libraries = []
    with zipfile.ZipFile(aab) as bundle:
        build = json.loads(bundle.read('base/assets/public/ontrack-build.json'))
        if build.get('showcase') is not False:
            raise ValueError('Showcase fixtures must never ship in a release bundle.')
        origin = urlsplit(build.get('apiOrigin', ''))
        if origin.scheme != 'https' or not origin.hostname or origin.username or origin.password or origin.path not in ('', '/') or origin.query or origin.fragment:
            raise ValueError('Bundled API origin must be an HTTPS origin.')
        if build.get('apiOrigin') != os.environ.get('ANDROID_API_ORIGIN', 'https://ontrack.hsichen.dev'):
            raise ValueError('Bundled API origin differs from the intended release backend.')
        if os.environ.get('ANDROID_REQUIRE_BILLING') == '1' and build.get('billingConfigured') is not True:
            raise ValueError('Bundle has no Play Billing key; rebuild with PLAY_BILLING_PUBLIC_KEY.')
        capacitor = json.loads(bundle.read('base/assets/capacitor.config.json'))
        server = capacitor.get('server', {})
        if server.get('url') or server.get('androidScheme') != 'https':
            raise ValueError('Release must use bundled HTTPS assets, without a remote Capacitor server URL.')
        if 'base/assets/public/app.html' not in bundle.namelist():
            raise ValueError('Bundled app.html is missing.')
        if b'static.cloudflareinsights.com/beacon.min.js' in bundle.read('base/assets/public/app.html'):
            raise ValueError('Android must not embed the website analytics beacon.')
        for entry in bundle.namelist():
            if '/lib/' not in entry or not entry.endswith('.so'):
                continue
            data = bundle.read(entry)
            abi = entry.split('/lib/')[1].split('/')[0]
            if abi in ('armeabi-v7a', 'x86') and data[:6] == b'\x7fELF\x01\x01':
                counterpart = entry.replace('/armeabi-v7a/', '/arm64-v8a/').replace('/x86/', '/x86_64/')
                if counterpart not in bundle.namelist():
                    raise ValueError(f'{entry} is missing its required 64-bit counterpart.')
                libraries.append(entry)
                continue
            if abi not in ('arm64-v8a', 'x86_64') or data[:6] != b'\x7fELF\x02\x01':
                raise ValueError(f'Unexpected native ABI: {entry}; review 64-bit support and alignment.')
            offset = struct.unpack_from('<Q', data, 32)[0]
            size, count = struct.unpack_from('<HH', data, 54)
            for index in range(count):
                kind, _, _, _, _, _, _, alignment = struct.unpack_from('<IIQQQQQQ', data, offset + size * index)
                if kind == 1 and alignment < 16384:
                    raise ValueError(f'{entry} is not aligned for 16 KB memory pages.')
            libraries.append(entry)
    if libraries:
        packaging = json.loads(config.read_text()).get('optimizations', {}).get('uncompressNativeLibraries', {})
        if packaging.get('alignment') != 'PAGE_ALIGNMENT_16K':
            raise ValueError('Bundle must request 16 KB APK native-library alignment from Play.')
    return {'package': package, 'versionCode': int(code), 'versionName': name,
            'targetSdk': int(sdk.get(android + 'targetSdkVersion')), 'nativeLibraries': libraries,
            'webBuild': build, 'sha256': hashlib.sha256(aab.read_bytes()).hexdigest()}


def main():
    try:
        aab, manifest, config = map(Path, sys.argv[1:])
        result = check_bundle(aab, manifest, config)
        result['commit'] = result['webBuild'].get('commit')
        result['workingTreeDirty'] = result['webBuild'].get('workingTreeDirty')
        (aab.parent / 'release-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
        print(f"Bundle verified: {result['package']} {result['versionName']} ({result['versionCode']}), API {result['targetSdk']}, 16 KB native alignment.")
    except (ValueError, OSError, KeyError, struct.error, ET.ParseError, zipfile.BadZipFile) as error:
        sys.exit(str(error))


if __name__ == '__main__':
    main()
