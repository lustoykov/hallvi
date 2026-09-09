import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import unittest
import test_controller_backups as fixtures

sys.modules.setdefault('controller_backup', fixtures.backup)
spec = importlib.util.spec_from_file_location('prepare_rehearsal', fixtures.SCRIPT.with_name('prepare_rehearsal.py'))
rehearsal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rehearsal)


class ControllerRehearsalTest(unittest.TestCase):
    def setUp(self):
        fixtures.ControllerBackupTest.setUp(self)
        (self.root / '.git/info/exclude').write_text('*\n')
        self.settings = self.config / 'pi-settings.json'
        self.settings.write_text(json.dumps({'mode': 'shared', 'authPath': '/old/mac/auth.json', 'providerId': 'selected'}))
        fixtures.backup.capture(self.args)
        self.payload = self.output / 'payload'
        self.manifest_path = self.payload / 'manifest.json'
        self.manifest = json.loads(self.manifest_path.read_text())
        self.target = self.root / 'working-copy'

    def prepare(self, **overrides):
        args = dict(payload=self.payload, target=self.target,
                    revision=self.manifest['sourceRevision'], original_stopped=True,
                    runtime_target='/recovery/active')
        args.update(overrides)
        return rehearsal.prepare(**args)

    def test_relocation_preserves_evidence_and_disables_environment(self):
        before = fixtures.backup.digest(self.payload / 'database/server-guy.db')
        result = self.prepare()
        self.assertEqual(fixtures.backup.digest(self.payload / 'database/server-guy.db'), before)
        fixtures.backup.verify(self.payload)
        for folder in ('config', 'database'):
            self.assertTrue((self.payload / folder / fixtures.backup.MARKER).exists())
            self.assertFalse((self.target / folder / fixtures.backup.MARKER).exists())
        self.assertFalse((self.target / 'manifest.json').exists())
        self.assertTrue((self.target / 'source-manifest.json').exists())
        settings = json.loads((self.target / 'config/pi-settings.json').read_text())
        self.assertEqual(settings['authPath'], '/old/mac/auth.json')
        self.assertEqual(settings['mode'], 'shared')
        self.assertFalse(result['modelCredentialPresent'])
        self.assertIn('.env.local.disabled', result['disabledEnvironmentFiles'])
        self.assertEqual(result['database']['nativeSessionsMatched'], 1)

    def test_available_selected_credential_is_relocated(self):
        credential = self.payload / 'config/recovery-provider-auth.json'
        credential.write_text('{"selected":{"type":"api_key","key":"fixture-only"}}')
        self.manifest['files']['config/recovery-provider-auth.json'] = fixtures.backup.digest(credential)
        self.manifest_path.write_text(json.dumps(self.manifest))
        report = self.prepare()
        settings = json.loads((self.target / 'config/pi-settings.json').read_text())
        self.assertEqual(settings['authPath'], '/recovery/active/config/recovery-provider-auth.json')
        self.assertEqual(settings['mode'], 'separate')
        self.assertTrue(report['modelCredentialPresent'])

    def test_runtime_location_must_be_explicit_and_absolute(self):
        for value in (None, 'relative'):
            with self.assertRaisesRegex(ValueError, 'absolute'):
                self.prepare(runtime_target=value)
            self.assertFalse(self.target.exists())

    def test_requires_original_controller_stopped(self):
        with self.assertRaisesRegex(ValueError, 'Stop'):
            self.prepare(original_stopped=False)
        self.assertFalse(self.target.exists())

    def test_rejects_wrong_source_and_dirty_checkpoint(self):
        with self.assertRaisesRegex(ValueError, 'exact'):
            self.prepare(revision='wrong')
        self.manifest['sourceDirty'] = True
        self.manifest_path.write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, 'exact'):
            self.prepare()

    def test_never_overwrites_original_or_existing_target(self):
        with self.assertRaisesRegex(ValueError, 'outside'):
            self.prepare(target=self.payload / 'nested')
        self.target.mkdir()
        with self.assertRaisesRegex(ValueError, 'new'):
            self.prepare()

    def test_refuses_queued_work_even_in_an_integral_snapshot(self):
        path = self.payload / 'database/server-guy.db'
        with sqlite3.connect(path) as db:
            db.execute("UPDATE application_operations SET state='queued'")
        self.manifest['files']['database/server-guy.db'] = fixtures.backup.digest(path)
        self.manifest_path.write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, 'Unsettled'):
            self.prepare()
        self.assertFalse(self.target.exists())


if __name__ == '__main__':
    unittest.main()
