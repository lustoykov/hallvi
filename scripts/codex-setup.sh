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

# Provider credentials arrive as Codex secrets, which exist only while this
# script runs: they are removed before the agent phase. Anything a task needs
# must be written down here, into the files the application already reads.
if [ -n "${HETZNER_API_TOKEN:-}" ]; then
  # connectHetzner verifies the token against the Cloud API and writes
  # .server-guy/hetzner-connection.json, exactly as Settings does.
  npx tsx -e 'import("./src/server/hetzner.ts").then((m) => m.connectHetzner(process.env.HETZNER_API_TOKEN))'
  echo "Hetzner connected for this container."
else
  echo "No HETZNER_API_TOKEN: server inspection and provisioning are unavailable." >&2
fi

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # The controller reads Cloudflare from the environment. .env.local is
  # gitignored, and is loaded by the worker, next dev and next build.
  printf 'CLOUDFLARE_API_TOKEN=%s\n' "$CLOUDFLARE_API_TOKEN" > .env.local
  if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    printf 'CLOUDFLARE_ACCOUNT_ID=%s\n' "$CLOUDFLARE_ACCOUNT_ID" >> .env.local
  fi
  chmod 600 .env.local
  echo "Cloudflare written to .env.local."
else
  echo "No CLOUDFLARE_API_TOKEN: DNS and R2 work are unavailable." >&2
fi

# Record which lockfile these modules came from; codex-maintenance.sh reinstalls
# only when the lockfile has changed since.
stamp="$HOME/.cache/server-guy/lock.sha"
mkdir -p "$(dirname "$stamp")"
sha256sum package-lock.json | cut -d' ' -f1 > "$stamp"
