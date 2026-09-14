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

# Beta trust model: Codex Secrets exist only during setup. Persist supplied
# provider credentials into the files Server Guy reads at runtime. These files
# are readable by the agent; gitignore and mode 600 are not agent isolation.
export NODE_USE_ENV_PROXY=1
if [ -n "${HETZNER_API_TOKEN:-}" ]; then
  npx tsx -e 'import("./src/server/hetzner.ts").then(m => m.connectHetzner(process.env.HETZNER_API_TOKEN)).then(() => console.log("Hetzner credential verified and saved.")).catch(() => { console.error("Hetzner credential setup failed; check the token and API connectivity."); process.exitCode = 1; })'
fi

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  npx tsx -e 'import("./src/server/cloudflare.ts").then(m => m.verifyCloudflare()).then(result => { if (!result.connected) throw new Error(); console.log("Cloudflare credential verified."); }).catch(() => { console.error("Cloudflare credential setup failed; check the token and API connectivity."); process.exitCode = 1; })'
  node --input-type=module <<'NODE'
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!/^[A-Za-z0-9_-]{20,256}$/.test(token) || (account && !/^[a-f0-9]{32}$/.test(account))) {
  throw new Error("Invalid Cloudflare credential format.");
}
let existing = "";
try { existing = readFileSync(".env.local", "utf8"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const retained = existing.split("\n").filter(line => !/^\s*(?:export\s+)?CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)\s*=/.test(line));
const values = [`CLOUDFLARE_API_TOKEN=${token}`];
if (account) values.push(`CLOUDFLARE_ACCOUNT_ID=${account}`);
const temporary = `.env.local.${randomUUID()}.tmp`;
writeFileSync(temporary, [...retained, ...values, ""].join("\n"), { mode: 0o600, flag: "wx" });
renameSync(temporary, ".env.local");
console.log("Cloudflare credential saved for the application.");
NODE
fi

# R2 backups use S3 access credentials in addition to the Cloudflare API token.
# Persist through the same application function as the backup Settings form.
if [ -n "${R2_ACCESS_KEY_ID:-}${R2_SECRET_ACCESS_KEY:-}${R2_BUCKET:-}" ]; then
  npx tsx -e 'import("./src/server/backup-connection.ts").then(m => m.saveBackupDestination({ provider: "r2", endpoint: process.env.R2_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: process.env.R2_BUCKET, region: "auto", accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY })).then(() => console.log("R2 backup configuration saved; backup and restore still require a live test.")).catch(() => { console.error("R2 backup setup failed; check the bucket, endpoint and both access credentials."); process.exitCode = 1; })'
fi

# Record which lockfile these modules came from; codex-maintenance.sh reinstalls
# only when the lockfile has changed since.
stamp="$HOME/.cache/server-guy/lock.sha"
mkdir -p "$(dirname "$stamp")"
sha256sum package-lock.json | cut -d' ' -f1 > "$stamp"
