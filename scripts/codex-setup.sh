#!/usr/bin/env bash
# Codex cloud setup for Server Guy. Runs once while the container is built,
# with network access. Everything the checks need must be installed here,
# because task runs may have no internet.
set +x
set -euo pipefail

cd "$(dirname "$0")/.."

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" != "22" ]; then
  echo "Node $major is in use; select Node.js 22 under the Codex environment preinstalled packages." >&2
  exit 1
fi

npm ci --no-audit --no-fund

# Chromium and its system libraries in the Codex universal image. A failure
# here must fail setup instead of leaving an unusable browser for the task.
npx playwright install --with-deps chromium

# A fresh development database, so the application and the inspector start.
npm run db:push

# Do not persist setup secrets into this cached filesystem. The checks need no
# provider credentials; runtime provider access must be configured separately.

# Record which lockfile these modules came from; codex-maintenance.sh reinstalls
# only when the lockfile has changed since.
stamp="$HOME/.cache/server-guy/lock.sha"
mkdir -p "$(dirname "$stamp")"
sha256sum package-lock.json | cut -d' ' -f1 > "$stamp"
