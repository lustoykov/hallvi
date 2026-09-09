import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / 'scripts/controller-backups/controller_backup.py'
spec = importlib.util.spec_from_file_location('controller_backup', SCRIPT)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class ControllerBackupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture'], check=True)
        self.config = self.root / '.server-guy'
        self.config.mkdir()
        self.db = self.config / 'server-guy.db'
        self.connection = sqlite3.connect(self.db)
        self.addCleanup(self.connection.close)
        self.connection.executescript('''PRAGMA journal_mode=WAL;
CREATE TABLE chats (application_id TEXT, id TEXT, native_session_id TEXT);
INSERT INTO chats VALUES ('app','chat','native');
CREATE TABLE pi_runs (status TEXT); INSERT INTO pi_runs VALUES ('succeeded');
CREATE TABLE application_operations (state TEXT); INSERT INTO application_operations VALUES ('verified');
CREATE TABLE conformance_runs (status TEXT);
CREATE TABLE deployments (status TEXT); INSERT INTO deployments VALUES ('live');
PRAGMA user_version=14;''')
        session = self.config / 'pi-sessions/app/chat.jsonl'
        session.parent.mkdir(parents=True)
        session.write_text(json.dumps({'type': 'session', 'id': 'native', 'version': 3, 'timestamp': '2026-09-09T00:00:00Z', 'cwd': '/fixture'}) + '\n')
        (self.root / '.env.local').write_text('SECRET=fixture-only\n')
        (self.config / 'backup-proofs').mkdir()
        (self.config / 'backup-proofs/disposable').write_text('not essential')
        self.output = self.root / 'capture'
        self.args = argparse.Namespace(project=str(self.root), config_dir=None, database=None, output=str(self.output), stopped=True)

    def test_wal_sessions_and_private_environment_roundtrip(self):
        result = backup.capture(self.args)
        self.assertEqual(result['nativeSessionsMatched'], 1)
        self.assertEqual(backup.verify(self.output / 'payload')['rows']['chats'], 1)
        self.assertFalse((self.output / 'payload/config/backup-proofs').exists())
        env = self.output / 'payload/environment/.env.local.disabled'
        self.assertEqual(env.read_text(), 'SECRET=fixture-only\n')
        self.assertEqual(env.stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.output / 'payload/database/RECOVERY_QUARANTINE').exists())

    def test_running_worker_is_refused(self):
        with sqlite3.connect(str(self.db) + '.worker-lock') as lock:
            lock.execute('BEGIN EXCLUSIVE')
            with self.assertRaises(sqlite3.OperationalError):
                backup.capture(self.args)
        self.assertFalse(self.output.exists())

    def test_queued_work_is_refused(self):
        self.connection.execute("INSERT INTO application_operations VALUES ('queued')")
        self.connection.commit()
        with self.assertRaisesRegex(ValueError, 'Unsettled'):
            backup.capture(self.args)

    def test_inflight_deployment_is_refused(self):
        self.connection.execute("UPDATE deployments SET status='deploying'")
        self.connection.commit()
        with self.assertRaisesRegex(ValueError, 'Unsettled'):
            backup.capture(self.args)

    def test_output_inside_controller_state_is_refused(self):
        self.args.output = str(self.config / 'checkpoint')
        with self.assertRaisesRegex(ValueError, 'outside'):
            backup.capture(self.args)

    def test_stopped_precondition_required(self):
        self.args.stopped = False
        with self.assertRaisesRegex(ValueError, 'Stop'):
            backup.capture(self.args)

    def test_native_session_mismatch_is_refused(self):
        self.connection.execute("UPDATE chats SET native_session_id='different'")
        self.connection.commit()
        with self.assertRaisesRegex(ValueError, 'session'):
            backup.capture(self.args)

    def test_tampering_and_extra_files_fail_verification(self):
        backup.capture(self.args)
        file = self.output / 'payload/config/extra'
        file.write_text('extra')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            backup.verify(self.output / 'payload')
        file.unlink()
        (self.output / 'payload/environment/.env.local.disabled').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'hash'):
            backup.verify(self.output / 'payload')

    def test_symlink_in_credentials_is_refused(self):
        (self.config / 'connection.json').symlink_to(self.root / '.env.local')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            backup.capture(self.args)

    def test_external_provider_exports_selected_credential_only(self):
        auth = self.root / 'external-auth.json'
        auth.write_text(json.dumps({'selected': {'type': 'api_key', 'key': 'fake'}, 'other': {'key': 'excluded'}}))
        (self.config / 'pi-settings.json').write_text(json.dumps({'authPath': str(auth), 'providerId': 'selected'}))
        backup.capture(self.args)
        exported = json.loads((self.output / 'payload/config/recovery-provider-auth.json').read_text())
        self.assertEqual(list(exported), ['selected'])

    def test_split_database_and_config_roots(self):
        other = self.root / 'separate-config'
        other.mkdir()
        (other / 'hetzner-connection.json').write_text('{"fixture":true}')
        self.args.config_dir = str(other)
        backup.capture(self.args)
        self.assertTrue((self.output / 'payload/config/hetzner-connection.json').exists())
        self.assertEqual(backup.verify(self.output / 'payload')['nativeSessionsMatched'], 1)

    def test_torn_session_json_is_refused(self):
        with (self.config / 'pi-sessions/app/chat.jsonl').open('a') as file:
            file.write('{"type":"message"')
        with self.assertRaises(json.JSONDecodeError):
            backup.capture(self.args)

    def test_snapshot_is_single_database_and_read_open_preserves_verification(self):
        backup.capture(self.args)
        database = self.output / 'payload/database/server-guy.db'
        self.assertFalse(Path(str(database) + '-wal').exists())
        self.assertFalse(Path(str(database) + '-shm').exists())
        connection = sqlite3.connect(database)
        self.assertEqual(connection.execute('PRAGMA journal_mode').fetchone()[0], 'delete')
        connection.execute('SELECT * FROM chats').fetchall()
        connection.close()
        self.assertEqual(backup.verify(self.output / 'payload')['nativeSessionsMatched'], 1)

    def test_waiting_proposal_is_preserved(self):
        self.connection.execute("INSERT INTO application_operations VALUES ('proposed')")
        self.connection.commit()
        self.assertEqual(backup.capture(self.args)['rows']['application_operations'], 2)

    def test_recovery_secret_in_payload_cannot_upload(self):
        secret = self.config / 'mistaken-password.json'
        secret.write_text('fixture-only-password')
        backup.capture(self.args)
        with self.assertRaisesRegex(backup.BackupError, 'outside'):
            backup.assert_recovery_secrets_excluded({'passwordFile': str(secret)}, self.output / 'payload')

    @unittest.skipUnless(shutil.which('restic'), 'restic is required for encrypted roundtrip')
    def test_real_encrypted_restic_roundtrip_and_wrong_key(self):
        backup.capture(self.args)
        password = self.root / 'password'
        password.write_text('fixture-password-not-a-real-secret')
        password.chmod(0o600)
        settings = {'repository': str(self.root / 'repository'), 'passwordFile': str(password)}
        backup.restic(settings, ['init'])
        output = backup.restic(settings, ['backup', '--json', '--tag', backup.TAG, 'payload'], cwd=self.output)
        summary = [json.loads(line) for line in output.splitlines() if json.loads(line).get('message_type') == 'summary'][0]
        target = self.root / 'restore'
        backup.restic(settings, ['restore', summary['snapshot_id'], '--target', str(target), '--verify'])
        self.assertEqual(backup.verify(target / 'payload')['nativeSessionsMatched'], 1)
        password.write_text('wrong-password')
        with self.assertRaises(backup.BackupError):
            backup.restic(settings, ['snapshots'])


if __name__ == '__main__':
    unittest.main()
