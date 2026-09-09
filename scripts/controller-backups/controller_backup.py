#!/usr/bin/env python3
"""Stopped-controller recovery checkpoints encrypted by restic. No service control."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess
import sys
from datetime import datetime, timezone

MARKER = 'RECOVERY_QUARANTINE'
TAG = 'server-guy-controller'


class BackupError(ValueError):
    """Authored, non-sensitive operator guidance safe to show in logs."""



def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)


def copy_private(source, target):
    if source.is_symlink():
        raise BackupError('Refusing a symlink in controller state')
    if source.is_dir():
        target.mkdir(mode=0o700, parents=True, exist_ok=True)
        for child in source.iterdir():
            if child.name == '.locks':
                continue
            copy_private(child, target / child.name)
    elif source.is_file():
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(0o600)
    else:
        raise BackupError('Controller state contains a non-regular file')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def database_evidence(path, sessions):
    with contextlib.closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise BackupError('Database integrity check failed')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise BackupError('Database foreign-key check failed')
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts = {t: db.execute('SELECT count(*) FROM "' + t.replace('"', '""') + '"').fetchone()[0] for t in tables}
        matched = 0
        for app, chat, native in db.execute('SELECT application_id,id,native_session_id FROM chats WHERE native_session_id IS NOT NULL'):
            if any('/' in x or '\\' in x or x in ('.', '..') for x in (app, chat)):
                raise BackupError('Invalid session identifier')
            path = sessions / app / (chat + '.jsonl')
            lines = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
            if not lines or not isinstance(lines[0], dict) or lines[0].get('type') != 'session' or lines[0].get('id') != native or type(lines[0].get('version')) is not int or not isinstance(lines[0].get('cwd'), str) or not isinstance(lines[0].get('timestamp'), str):
                raise BackupError('Native session does not match its chat record')
            datetime.fromisoformat(lines[0]['timestamp'].replace('Z', '+00:00'))
            for line in lines[1:]:
                if not isinstance(line, dict) or not isinstance(line.get('id'), str) or not isinstance(line.get('type'), str) or line['type'] == 'session':
                    raise BackupError('Malformed native session entry')
            matched += 1
        return {'schemaVersion': db.execute('PRAGMA user_version').fetchone()[0], 'rows': counts, 'nativeSessionsMatched': matched}


def capture(args):
    if not args.stopped:
        raise BackupError('Stop the web app and worker, then supply --stopped')
    root = Path(args.project).resolve()
    config = Path(args.config_dir or os.environ.get('SERVER_GUY_CONFIG_DIR') or root / '.server-guy')
    database = Path(args.database or os.environ.get('SERVER_GUY_DB_PATH') or root / '.server-guy/server-guy.db')
    config = (root / config).resolve()
    database = (root / database).resolve(strict=True)
    output = Path(args.output).absolute()
    if output.exists():
        raise BackupError('Capture output must not exist')
    if output.resolve().is_relative_to(config) or output.resolve().is_relative_to(database.parent):
        raise BackupError('Capture output must be outside controller state directories')
    # A required operator precondition covers the web process; these OS locks
    # additionally reject running workers and block them throughout capture.
    with contextlib.ExitStack() as stack:
        for suffix in ('.worker-lock', '.deployment-lock'):
            lock = sqlite3.connect(str(database) + suffix, timeout=0)
            stack.callback(lock.close)
            lock.execute('BEGIN EXCLUSIVE')
        db = sqlite3.connect(database.as_uri() + '?mode=rw', uri=True, timeout=0)
        stack.callback(db.close)
        db.execute('BEGIN IMMEDIATE')
        for table, column, terminal in [
            ('pi_runs', 'status', ('succeeded', 'failed', 'cancelled', 'interrupted', 'timed-out')),
            ('application_operations', 'state', ('verified', 'failed', 'inspected', 'cancelled', 'proposed')),
            ('conformance_runs', 'status', ('passed', 'failed', 'cancelled', 'interrupted', 'timed-out', 'unavailable')),
            ('deployments', 'status', ('live', 'failed', 'awaiting-approval')),
        ]:
            placeholders = ','.join('?' for _ in terminal)
            if db.execute(f'SELECT count(*) FROM {table} WHERE {column} NOT IN ({placeholders})', terminal).fetchone()[0]:
                raise BackupError('Unsettled controller work: finish or explicitly resolve it before capture')
        output.mkdir(mode=0o700, parents=True)
        payload = output / 'payload'
        payload.mkdir(mode=0o700)
        for name in ('database', 'config', 'environment'):
            (payload / name).mkdir(mode=0o700)
        # Independent read connection uses SQLite's backup API, including WAL.
        with contextlib.closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as reader, contextlib.closing(sqlite3.connect(payload / 'database/server-guy.db')) as target:
            reader.backup(target)
            target.execute('PRAGMA journal_mode=DELETE')
        (payload / 'database/server-guy.db').chmod(0o600)
        sessions = database.parent / 'pi-sessions'
        if sessions.exists():
            copy_private(sessions, payload / 'database/pi-sessions')
        for path in config.glob('*.json'):
            copy_private(path, payload / 'config' / path.name)
        for name in ('deployments', 'backup-schedules', 'backup-destinations'):
            if (config / name).exists():
                copy_private(config / name, payload / 'config' / name)
        dependencies = []
        settings = config / 'pi-settings.json'
        if settings.exists():
            pi = json.loads(settings.read_text())
            auth = Path(pi['authPath'])
            if not auth.is_absolute():
                auth = root / auth
            if auth.exists():
                if auth.is_symlink():
                    raise BackupError('Refusing a symlink for provider credentials')
                provider = pi['providerId']
                credential = json.loads(auth.read_text()).get(provider)
                if credential is None:
                    dependencies.append('Selected model provider credential is missing; reconnect after recovery')
                else:
                    write_json(payload / 'config/recovery-provider-auth.json', {provider: credential})
                    dependencies.append('Repoint pi-settings.json authPath to recovery-provider-auth.json; refresh or reconnect expired model credentials')
            else:
                dependencies.append('Configured model credential file is missing; reconnect after recovery')
        for name in ('.env', '.env.local'):
            if (root / name).exists():
                copy_private(root / name, payload / 'environment' / (name + '.disabled'))
        for directory in ('database', 'config'):
            (payload / directory / MARKER).write_text('Recovery copy: review paths, credentials and queued work before activation.\n')
            (payload / directory / MARKER).chmod(0o600)
        evidence = database_evidence(payload / 'database/server-guy.db', payload / 'database/pi-sessions')
        revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        dirty = bool(subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain'], text=True).strip())
        manifest = {'format': 1, 'capturedAt': now(), 'sourceRevision': revision, 'sourceDirty': dirty, 'database': evidence,
                    'sourcePaths': {'project': str(root), 'config': str(config), 'database': str(database)},
                    'recoveryDependencies': dependencies,
                    'excluded': ['backup-proofs', 'diagnostics', 'process locks', 'old database copies', 'source checkout and node_modules'],
                    'files': {str(p.relative_to(payload)): digest(p) for p in sorted(payload.rglob('*')) if p.is_file()}}
        write_json(payload / 'manifest.json', manifest)
    return {'capturedAt': manifest['capturedAt'], 'files': len(manifest['files']), **evidence, 'recoveryDependencies': dependencies}


def verify(payload):
    payload = payload.resolve()
    manifest = json.loads((payload / 'manifest.json').read_text())
    if manifest.get('format') != 1:
        raise BackupError('Unknown controller backup format')
    actual = set()
    for path in payload.rglob('*'):
        if path.is_symlink():
            raise BackupError('Symlink in restored checkpoint')
        if path.is_file() and path != payload / 'manifest.json':
            actual.add(str(path.relative_to(payload)))
    if actual != set(manifest['files']):
        raise BackupError('Checkpoint file inventory differs from manifest')
    for name, expected in manifest['files'].items():
        path = payload / name
        if not path.resolve().is_relative_to(payload) or digest(path) != expected:
            raise BackupError('Checkpoint file hash mismatch')
    evidence = database_evidence(payload / 'database/server-guy.db', payload / 'database/pi-sessions')
    if evidence != manifest['database']:
        raise BackupError('Database evidence differs from capture')
    for directory in ('database', 'config'):
        if not (payload / directory / MARKER).is_file():
            raise BackupError('Recovery quarantine marker missing')
    return evidence


def assert_recovery_secrets_excluded(settings, payload):
    hashes = set(json.loads((payload / 'manifest.json').read_text())['files'].values())
    for key in ('passwordFile', 'credentialFile'):
        if settings.get(key):
            secret = Path(settings[key]).resolve()
            if secret.is_relative_to(payload.resolve()) or digest(secret) in hashes:
                raise BackupError('Controller recovery password/storage credential must be outside the captured payload')


def restic(settings, arguments, cwd=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith(('RESTIC_', 'AWS_'))}
    password = Path(settings['passwordFile'])
    if password.is_symlink() or stat.S_IMODE(password.stat().st_mode) & 0o077:
        raise BackupError('Recovery password file must be private (0600)')
    env.update(RESTIC_REPOSITORY=settings['repository'], RESTIC_PASSWORD_FILE=str(password))
    if settings.get('credentialFile'):
        credential_path = Path(settings['credentialFile'])
        if credential_path.is_symlink() or stat.S_IMODE(credential_path.stat().st_mode) & 0o077:
            raise BackupError('Storage credential file must be private (0600)')
        credential = json.loads(credential_path.read_text())
        env.update(AWS_ACCESS_KEY_ID=credential['accessKeyId'], AWS_SECRET_ACCESS_KEY=credential['secretAccessKey'], AWS_DEFAULT_REGION=settings.get('region', 'auto'))
    process = subprocess.run([settings.get('restic', 'restic'), '--no-cache', *arguments], env=env, cwd=cwd, capture_output=True, text=True, timeout=600)
    if process.returncode:
        # Backend responses may contain sensitive locations; keep logs redacted.
        raise BackupError('restic operation failed (exit ' + str(process.returncode) + '); no verified checkpoint recorded')
    return process.stdout


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    cap = sub.add_parser('capture')
    cap.add_argument('--project', default=str(Path.cwd()))
    cap.add_argument('--config-dir')
    cap.add_argument('--database')
    cap.add_argument('--output', required=True)
    cap.add_argument('--stopped', action='store_true')
    for name in ('init', 'upload', 'restore'):
        command = sub.add_parser(name)
        command.add_argument('--settings', required=True)
        if name == 'upload':
            command.add_argument('--source', required=True)
        if name == 'restore':
            command.add_argument('--snapshot', required=True)
            command.add_argument('--target', required=True)
    check = sub.add_parser('verify')
    check.add_argument('--payload', required=True)
    args = parser.parse_args()
    if args.command == 'capture':
        result = capture(args)
    elif args.command == 'verify':
        result = verify(Path(args.payload))
    else:
        settings = json.loads(Path(args.settings).read_text())
        if args.command == 'init':
            restic(settings, ['init'])
            result = {'initialized': True}
        elif args.command == 'upload':
            source = Path(args.source).resolve()
            evidence = verify(source / 'payload')
            assert_recovery_secrets_excluded(settings, source / 'payload')
            events = restic(settings, ['backup', '--json', '--tag', TAG, 'payload'], cwd=source)
            summary = next(json.loads(line) for line in events.splitlines() if json.loads(line).get('message_type') == 'summary')
            result = {'uploadedAt': now(), 'snapshot': summary['snapshot_id'], 'database': evidence}
        else:
            if not args.snapshot or any(c not in '0123456789abcdef' for c in args.snapshot) or len(args.snapshot) != 64:
                raise BackupError('Restore requires the exact 64-character snapshot ID')
            target = Path(args.target).absolute()
            if target.exists():
                raise BackupError('Restore target must not exist')
            target.mkdir(mode=0o700, parents=True)
            (target / MARKER).write_text('Isolated recovery verification only.\n')
            restic(settings, ['restore', args.snapshot, '--tag', TAG, '--target', str(target), '--verify'])
            for path in target.rglob('*'):
                if not path.is_symlink():
                    path.chmod(0o700 if path.is_dir() else 0o600)
            evidence = verify(target / 'payload')
            result = {'restoredAt': now(), 'snapshot': args.snapshot, 'quarantined': True, 'database': evidence}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print exception bodies: JSON and backend errors can contain secrets.
        message = str(error) if isinstance(error, BackupError) else type(error).__name__ + '. Check paths, valid JSON, file permissions and credentials.'
        print('Controller backup failed: ' + message, file=sys.stderr)
        sys.exit(1)
