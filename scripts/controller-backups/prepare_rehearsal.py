#!/usr/bin/env python3
"""Prepare a working copy for an offline UI rehearsal. Never starts a worker."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import sqlite3

from controller_backup import BackupError, MARKER, copy_private, verify, write_json


def prepare(payload, target, revision, original_stopped, runtime_target=None):
    payload = Path(payload).resolve(strict=True)
    target = Path(target).resolve()
    if not original_stopped:
        raise BackupError('Stop the original controller before preparing a replacement working copy')
    if target.exists() or target.is_relative_to(payload):
        raise BackupError('Working-copy target must be new and outside the preserved checkpoint')
    evidence = verify(payload)
    manifest = json.loads((payload / 'manifest.json').read_text())
    if manifest['sourceDirty'] or manifest['sourceRevision'] != revision:
        raise BackupError('Use the exact committed source revision recorded by a clean checkpoint')
    with contextlib.closing(sqlite3.connect((payload / 'database/server-guy.db').as_uri() + '?mode=ro', uri=True)) as db:
        for table, column, allowed in [
            ('pi_runs', 'status', ('succeeded', 'failed', 'cancelled', 'interrupted', 'timed-out')),
            ('application_operations', 'state', ('verified', 'failed', 'inspected', 'cancelled', 'proposed')),
            ('conformance_runs', 'status', ('passed', 'failed', 'cancelled', 'interrupted', 'timed-out', 'unavailable')),
            ('deployments', 'status', ('live', 'failed', 'awaiting-approval')),
        ]:
            marks = ','.join('?' for _ in allowed)
            if db.execute(f'SELECT count(*) FROM {table} WHERE {column} NOT IN ({marks})', allowed).fetchone()[0]:
                raise BackupError('Unsettled work must be reconciled before replacement preparation')
    if runtime_target is None or not Path(runtime_target).is_absolute():
        raise BackupError('An explicit absolute runtime target is required')
    runtime = Path(runtime_target)
    copy_private(payload, target)
    settings = target / 'config/pi-settings.json'
    model_credential_present = (target / 'config/recovery-provider-auth.json').is_file()
    if settings.exists() and model_credential_present:
        config = json.loads(settings.read_text())
        config['authPath'] = str(runtime / 'config/recovery-provider-auth.json')
        config['mode'] = 'separate'
        write_json(settings, config)
    # Remove markers only from the new working copy, never from source evidence.
    for directory in ('database', 'config'):
        (target / directory / MARKER).unlink()
    # This is deliberately not a second valid checkpoint manifest after edits.
    (target / 'manifest.json').rename(target / 'source-manifest.json')
    report = {
        'sourceRevision': revision,
        'database': evidence,
        'mode': 'offline UI rehearsal only; no worker or model calls',
        'environment': {'SERVER_GUY_DB_PATH': str(runtime / 'database/server-guy.db'),
                        'SERVER_GUY_CONFIG_DIR': str(runtime / 'config')},
        'modelCredentialPresent': model_credential_present,
        'disabledEnvironmentFiles': [p.name for p in (target / 'environment').iterdir()],
        'beforeRealActivation': ['Verify independent recovery-kit custody',
                                 'Renew/reconnect missing or expired provider credentials',
                                 'Review all pending decisions and host ownership',
                                 'Explicitly approve enabling workers on the replacement'],
    }
    write_json(target / 'rehearsal.json', report)
    verify(payload)
    return report


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--source-revision', required=True)
    parser.add_argument('--runtime-target', required=True)
    parser.add_argument('--original-stopped', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(args.payload, args.target, args.source_revision,
                             args.original_stopped, args.runtime_target), indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, BackupError) else type(error).__name__
        print('Recovery rehearsal preparation failed: ' + message, file=__import__('sys').stderr)
        raise SystemExit(1)
