import importlib.util
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bundle_check', ROOT / 'scripts/android-bundle-check.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class BundleContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.aab = self.folder / 'app.aab'
        self.manifest = self.folder / 'manifest.xml'
        self.config = self.folder / 'config.json'
        self.config.write_text(json.dumps({'optimizations': {'uncompressNativeLibraries': {'alignment': 'PAGE_ALIGNMENT_16K'}}}))
        self.manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.hsichen.ontrack" android:versionCode="17" android:versionName="1.2.3"><uses-sdk android:targetSdkVersion="36"/><application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>')
        self.write_library(16384)
        self.environment = patch.dict(os.environ, {'ANDROID_VERSION_CODE': '17', 'ANDROID_VERSION_NAME': '1.2.3'})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def write_library(self, alignment):
        data = bytearray(120)
        data[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<Q', data, 32, 64)
        struct.pack_into('<HH', data, 54, 56, 1)
        struct.pack_into('<IIQQQQQQ', data, 64, 1, 0, 0, 0, 0, 0, 0, alignment)
        with zipfile.ZipFile(self.aab, 'w') as archive:
            archive.writestr('base/lib/arm64-v8a/libexample.so', data)
            archive.writestr('base/assets/public/ontrack-build.json', json.dumps({'showcase': False, 'apiOrigin': 'https://ontrack.hsichen.dev', 'billingConfigured': False}))
            archive.writestr('base/assets/public/app.html', '<html/>')
            archive.writestr('base/assets/capacitor.config.json', '{"server":{"androidScheme":"https"}}')

    def verify(self):
        return check.check_bundle(self.aab, self.manifest, self.config)

    def replace_manifest(self, before, after):
        self.manifest.write_text(self.manifest.read_text().replace(before, after))

    def test_verified_bundle_records_identity_and_checksum(self):
        result = self.verify()
        self.assertEqual(result['versionCode'], 17)
        self.assertEqual(len(result['sha256']), 64)

    def change_build(self, **changes):
        with zipfile.ZipFile(self.aab) as archive:
            files = {name: archive.read(name) for name in archive.namelist()}
        path = 'base/assets/public/ontrack-build.json'
        build = json.loads(files[path])
        build.update(changes)
        files[path] = json.dumps(build).encode()
        with zipfile.ZipFile(self.aab, 'w') as archive:
            for name, data in files.items():
                archive.writestr(name, data)

    def test_showcase_build_cannot_ship(self):
        self.change_build(showcase=True)
        with self.assertRaisesRegex(ValueError, 'Showcase'):
            self.verify()

    def test_wrong_backend_cannot_ship(self):
        self.change_build(apiOrigin='https://staging.example.com')
        with self.assertRaisesRegex(ValueError, 'intended release backend'):
            self.verify()

    def test_upload_requires_billing_in_the_artifact(self):
        with patch.dict(os.environ, {'ANDROID_REQUIRE_BILLING': '1'}):
            with self.assertRaisesRegex(ValueError, 'Billing key'):
                self.verify()
            self.change_build(billingConfigured=True)
            self.verify()

    def test_cleartext_and_backup_cannot_be_enabled(self):
        for setting in ('allowBackup', 'usesCleartextTraffic'):
            original = self.manifest.read_text()
            self.replace_manifest(setting + '="false"', setting + '="true"')
            with self.assertRaisesRegex(ValueError, 'backup and cleartext'):
                self.verify()
            self.manifest.write_text(original)

    def test_debug_package_is_rejected(self):
        self.replace_manifest('package="dev.hsichen.ontrack"', 'package="dev.hsichen.ontrack.debug"')
        with self.assertRaisesRegex(ValueError, 'package'):
            self.verify()

    def test_stale_version_is_rejected(self):
        self.replace_manifest('versionCode="17"', 'versionCode="16"')
        with self.assertRaisesRegex(ValueError, 'version'):
            self.verify()

    def test_outdated_target_sdk_is_rejected(self):
        self.replace_manifest('targetSdkVersion="36"', 'targetSdkVersion="35"')
        with self.assertRaisesRegex(ValueError, 'API 36'):
            self.verify()

    def test_new_permissions_require_policy_review(self):
        for permission in ('ACCESS_BACKGROUND_LOCATION', 'READ_MEDIA_IMAGES', 'FOREGROUND_SERVICE'):
            with self.subTest(permission=permission):
                original = self.manifest.read_text()
                self.replace_manifest('<application android:allowBackup="false" android:usesCleartextTraffic="false"/>', f'<uses-permission android:name="android.permission.{permission}"/><application android:allowBackup="false" android:usesCleartextTraffic="false"/>')
                with self.assertRaisesRegex(ValueError, 'permissions'):
                    self.verify()
                self.manifest.write_text(original)

    def test_four_kilobyte_elf_alignment_is_rejected(self):
        self.write_library(4096)
        with self.assertRaisesRegex(ValueError, '16 KB memory'):
            self.verify()

    def test_four_kilobyte_apk_packaging_is_rejected(self):
        self.config.write_text('{}')
        with self.assertRaisesRegex(ValueError, '16 KB APK'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
