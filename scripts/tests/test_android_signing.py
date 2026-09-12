import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]


class UploadSigningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.folder = Path(cls.temp.name)
        subprocess.run(['javac', '-d', str(cls.folder), str(ROOT / 'scripts/AndroidSigningCheck.java')], check=True, capture_output=True)
        cls.keystore = cls.folder / 'test.jks'
        cls.password = 'fixture=password123'
        subprocess.run(['keytool', '-genkeypair', '-noprompt', '-storetype', 'JKS', '-keystore', str(cls.keystore),
                        '-alias', 'test-upload', '-storepass', cls.password, '-keypass', cls.password,
                        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '3650', '-dname', 'CN=OnTrack Test'],
                       check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_check(self, operation, path, extra=None):
        env = {key: value for key, value in os.environ.items() if not key.startswith('ANDROID_KEY')}
        env.update(extra or {})
        return subprocess.run(['java', '-cp', str(self.folder), 'AndroidSigningCheck', operation, str(path)], env=env, text=True, capture_output=True)

    def signing_env(self):
        return {'ANDROID_KEYSTORE_PATH': str(self.keystore), 'ANDROID_KEYSTORE_PASSWORD': self.password,
                'ANDROID_KEY_ALIAS': 'test-upload', 'ANDROID_KEY_PASSWORD': self.password}

    def test_upload_key_is_checked_without_a_play_account(self):
        result = self.run_check('signing', self.folder, self.signing_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SHA-256', result.stdout)
        self.assertNotIn(self.password, result.stdout)

    def test_wrong_password_fails_without_disclosing_it(self):
        env = self.signing_env()
        env['ANDROID_KEYSTORE_PASSWORD'] = 'wrong-private-password'
        result = self.run_check('signing', self.folder, env)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(env['ANDROID_KEYSTORE_PASSWORD'], result.stderr)

    def test_incomplete_configuration_fails_early(self):
        result = self.run_check('signing', self.folder)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing ANDROID_KEYSTORE_PATH', result.stderr)

    def test_unsigned_and_tampered_bundles_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            aab = Path(directory) / 'test.aab'
            with zipfile.ZipFile(aab, 'w') as archive:
                archive.writestr('base/manifest/AndroidManifest.xml', 'fixture')
            self.assertNotEqual(self.run_check('bundle', aab).returncode, 0)
            subprocess.run(['jarsigner', '-keystore', str(self.keystore), '-storepass', self.password,
                            '-keypass', self.password, str(aab), 'test-upload'], check=True, capture_output=True)
            result = self.run_check('bundle', aab)
            self.assertEqual(result.returncode, 0, result.stderr)
            with zipfile.ZipFile(aab, 'a') as archive:
                archive.writestr('base/unverified-content', 'changed after signing')
            self.assertNotEqual(self.run_check('bundle', aab).returncode, 0)


if __name__ == '__main__':
    unittest.main()
