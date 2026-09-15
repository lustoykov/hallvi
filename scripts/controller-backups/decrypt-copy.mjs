#!/usr/bin/env node
// Opens one automatic controller copy into a quarantined directory.
//
//   node --import tsx scripts/controller-backups/decrypt-copy.mjs \
//     --archive /private/controller-copy.tar.enc \
//     --passphrase-file /private/recovery-passphrase.txt \
//     --target /private/controller-restore
//
// Download the object yourself with any S3 client: the copies are under the
// controller/ prefix of the bucket in the recovery kit. This command does not
// start anything, contact a host or activate a controller; it verifies the
// copy and leaves it quarantined. The activation boundary is in README.md.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { openControllerCopy } from "../../src/server/controller-protection.ts";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const archive = option("archive");
const target = option("target");
const passphraseFile = option("passphrase-file");
const passphrase =
  option("passphrase") ??
  (passphraseFile && readFileSync(passphraseFile, "utf8").trim());
if (!archive || !target || !passphrase) {
  console.error(
    "Usage: --archive FILE --target DIR (--passphrase-file FILE | --passphrase VALUE)",
  );
  process.exit(2);
}
if (existsSync(target)) {
  console.error("The target must not exist: choose a new directory.");
  process.exit(1);
}
process.umask(0o077);
try {
  const { manifest, entries } = openControllerCopy(
    readFileSync(archive),
    passphrase,
  );
  mkdirSync(target, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(target, "RECOVERY_QUARANTINE"),
    "Isolated recovery copy: review paths, credentials and queued work before activation.\n",
    { mode: 0o600 },
  );
  for (const entry of entries) {
    const path = join(target, entry.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, entry.content, { mode: 0o600 });
  }
  console.log(
    JSON.stringify(
      {
        openedAt: new Date().toISOString(),
        capturedAt: manifest.capturedAt,
        files: entries.length,
        quarantined: true,
        payload: join(target, "payload"),
        recoveryDependencies: manifest.recoveryDependencies,
        next: "Read scripts/controller-backups/README.md: inspect the database read-only, review credentials and paths, and only then copy state into explicitly chosen activation paths.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  // Never print the exception body: it can carry file contents.
  console.error(
    `The copy could not be opened: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exit(1);
}
