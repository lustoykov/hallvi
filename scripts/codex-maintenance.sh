#!/usr/bin/env bash
# Codex cloud maintenance for Server Guy. Runs each time a cached container
# resumes, before the task. Keep it cheap: reinstall only on a lockfile change.
set +x
set -euo pipefail

cd "$(dirname "$0")/.."

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" != "22" ]; then
  echo "Node $major is in use; select Node.js 22 under the Codex environment preinstalled packages." >&2
  exit 1
fi

stamp="$HOME/.cache/server-guy/lock.sha"
current=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ ! -d node_modules ] || [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$current" ]; then
  npm ci --no-audit --no-fund
  mkdir -p "$(dirname "$stamp")"
  printf '%s\n' "$current" > "$stamp"
fi

# A changed lockfile may select a different Chromium build. The task branch may
# also have changed the database schema since the container was cached.
npx playwright install chromium
npm run db:push
