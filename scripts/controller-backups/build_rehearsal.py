#!/usr/bin/env python3
"""Build a secret-free Linux rehearsal image from an exact Git commit archive."""
import argparse
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--context', required=True)
    parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.revision):
        parser.error('--revision must be the full commit from the snapshot manifest')
    repository = Path(__file__).resolve().parents[2]
    context = Path(args.context).resolve()
    if context.exists():
        parser.error('--context must be a new directory')
    archive_bytes = subprocess.check_output(['git', '-C', str(repository), 'archive', args.revision])
    with tarfile.open(fileobj=io.BytesIO(archive_bytes)) as archive:
        for member in archive.getmembers():
            path = Path(member.name)
            if path.parts[0] in ('.server-guy', '.claude', '.worktrees', 'node_modules', '.next') or path.name in ('.env', '.env.local'):
                raise ValueError('Private runtime content is tracked by this revision; refusing the build')
        context.mkdir(mode=0o700, parents=True)
        archive.extractall(context, filter='data')
    marker = context / 'RECOVERY_SOURCE_REVISION'
    marker.write_text(args.revision + '\n')
    marker.chmod(0o644)
    dockerfile = context / 'Dockerfile.recovery'
    shutil.copyfile(Path(__file__).with_name('rehearsal.Dockerfile'), dockerfile)
    dockerfile.chmod(0o644)
    subprocess.run(['docker', 'build', '--build-arg', f'REHEARSAL_UID={os.getuid()}',
                    '--build-arg', f'REHEARSAL_GID={os.getgid()}', '-f', str(dockerfile),
                    '-t', args.tag, str(context)], check=True)
    print('Built the committed source archive; revision marker records build provenance, not image attestation.')


if __name__ == '__main__':
    main()
