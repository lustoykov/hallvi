#!/usr/bin/env bash
# Codex cloud maintenance for Server Guy. Runs each time a cached container
# resumes, before the task. Keep it cheap: reinstall only on a lockfile change.
set -euo pipefail

cd "$(dirname "$0")/.."

stamp="$HOME/.cache/server-guy/lock.sha"
current=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$current" ]; then
  npm ci
  mkdir -p "$(dirname "$stamp")"
  printf '%s\n' "$current" > "$stamp"
fi
