#!/usr/bin/env bash
# Codex cloud setup for Server Guy. Runs once while the container is built,
# with network access. Everything the checks need must be installed here,
# because task runs may have no internet.
set -euo pipefail

cd "$(dirname "$0")/.."

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" != "22" ]; then
  echo "Node $major is in use; the CI baseline is 22. Set CODEX_ENV_NODE_VERSION=22 on the environment." >&2
fi

npm ci

# Chromium for the browser suite. --with-deps needs root; fall back to the
# browser alone when the image already carries the system libraries.
npx playwright install --with-deps chromium || npx playwright install chromium

# A fresh development database, so the application and the inspector start.
npm run db:push

# Record which lockfile these modules came from; codex-maintenance.sh reinstalls
# only when the lockfile has changed since.
stamp="$HOME/.cache/server-guy/lock.sha"
mkdir -p "$(dirname "$stamp")"
sha256sum package-lock.json | cut -d' ' -f1 > "$stamp"
