// Writes and signs the one document a release is.
//
// Run once per release, after both platform archives exist, with the private
// key that never lives in this repository or in an installation. It refuses to
// write anything without that key: an unsigned manifest would be a release
// every Hallvi rejects, published as though it were fine, and a fallback that
// skipped the signature would defeat the point of having one.
//
// It then verifies its own output with the public key Hallvi actually ships,
// so a key that no longer matches is a failed release rather than an update
// nobody can install.
import { createPrivateKey, sign } from "node:crypto";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, supported } from "./migrations.mjs";

import { PLATFORMS, trustedKeys, verifyManifest } from "./release-trust.mjs";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};

const version = flag("version");
const revision = flag("revision");
const channel = flag("channel", "alpha");
const tag = flag("tag", version ? `v${version}` : undefined);
const repository = flag("repository", "lustoykov/hallvi");
const directory = flag("directory", "dist");
const notes = flag(
  "notes",
  tag ? `https://github.com/${repository}/releases/tag/${tag}` : undefined,
);
const base = flag(
  "base-url",
  tag ? `https://github.com/${repository}/releases/download/${tag}` : undefined,
);
const out = flag("out", join(directory, "hallvi-release.json"));

if (!version || !revision || !tag || !notes || !base) {
  console.error(
    "Usage: node scripts/sign-release.mjs --version <v> --revision <sha> [--channel alpha] [--tag <tag>]",
  );
  process.exit(2);
}

// The one secret involved. It is read from the environment so that it is
// never a file in the repository and never a line in a command's history.
const secret = process.env.HALLVI_RELEASE_SIGNING_KEY?.trim();
if (!secret) {
  console.error(
    `Release blocked: HALLVI_RELEASE_SIGNING_KEY is not set, so this release cannot be signed.
Hallvi installs only signed releases, and there is deliberately no unsigned path.
See docs/releases.md for where the ${channel} signing key lives and how to supply it.`,
  );
  process.exit(1);
}
let key;
try {
  // Accept the PEM itself, or the same PEM base64-encoded for a secret store
  // that dislikes newlines.
  const pem = secret.includes("PRIVATE KEY")
    ? secret
    : Buffer.from(secret, "base64").toString("utf8");
  key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error(`the key is ${key.asymmetricKeyType}, not ed25519`);
} catch (error) {
  console.error(
    `Release blocked: HALLVI_RELEASE_SIGNING_KEY could not be read as an Ed25519 private key (${
      error instanceof Error ? error.message : error
    }).`,
  );
  process.exit(1);
}

const schemaVersion = JSON.parse(
  readFileSync(join("src", "server", "schema-version.json"), "utf8"),
).version;

// Which schemas this release can take records from. It has to travel with the
// release: the installation deciding whether to download it is the older one,
// and its own list cannot know about a migration written after it shipped.
const migratesFrom = [...new Set(MIGRATIONS.map((step) => step.from))].filter(
  (from) => from !== schemaVersion && supported(from, schemaVersion),
);

const packages = {};
for (const platform of PLATFORMS) {
  const file = `hallvi-${version}-${platform}.tgz`;
  const path = join(directory, file);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    continue;
  }
  packages[platform] = {
    file,
    url: `${base}/${file}`,
    size,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
}
if (Object.keys(packages).length !== PLATFORMS.length) {
  console.error(
    `Release blocked: ${directory} has archives for ${
      Object.keys(packages).join(", ") || "no platform"
    }, and a release names all of ${PLATFORMS.join(", ")}.
Build each platform on its own machine, collect both archives here, then sign once.`,
  );
  process.exit(1);
}

// Two spaces and a trailing newline, always: the bytes below are what gets
// signed, so how they are written is part of the format.
const bytes = Buffer.from(
  `${JSON.stringify(
    {
      hallviRelease: 1,
      channel,
      version,
      revision,
      schemaVersion,
      migratesFrom,
      releasedAt: new Date().toISOString(),
      notes,
      packages,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
const signature = sign(null, bytes, key).toString("base64");

// What an installation will do with this, done here first. The key checked
// against is the one the readers of this release use: Hallvi's own, unless
// this environment names another, as a fork's or a test installation's does.
const trust = trustedKeys();
try {
  verifyManifest({ bytes, signature, channel, keys: trust.keys });
} catch (error) {
  console.error(
    `Release blocked: this signing key does not match the ${
      trust.own
        ? "public key Hallvi ships"
        : "public key HALLVI_RELEASE_KEY names"
    } (${error instanceof Error ? error.message : error}).
Signing with a key installations do not trust would publish a release none of them can install.`,
  );
  process.exit(1);
}

writeFileSync(out, bytes);
writeFileSync(`${out}.sig`, `${signature}\n`);
console.log(
  `Signed ${channel} release ${version} (${revision.slice(0, 7)})${
    trust.own ? "" : " with a key from HALLVI_RELEASE_KEY, not Hallvi's own"
  }:`,
);
for (const [platform, entry] of Object.entries(packages))
  console.log(`  ${platform}  ${entry.file}  ${entry.sha256.slice(0, 16)}…`);
console.log(`  manifest  ${out}`);
console.log(`  signature ${out}.sig`);
