// What Hallvi will accept as a release, and the key that says so.
//
// A checksum only catches a transfer that went wrong. It cannot tell a release
// from something else served at the same address, because whoever serves the
// archive serves the checksum beside it. So the thing Hallvi trusts is one
// small JSON document — the manifest — signed with a key that never leaves the
// maintainer's machine and the release workflow's secret store. Everything
// else follows from the manifest: which versions exist, where each platform's
// archive is, how large it is and what it hashes to.
//
// Ed25519, from Node's own crypto. No key rotation framework, no certificate
// chain: one public key, written here, checked against one signature.
import { createPublicKey, verify } from "node:crypto";

/** The prebuilt targets a release may name. Nothing else installs. */
export const PLATFORMS = ["darwin-arm64", "linux-x64"];

/**
 * One channel for now. It exists so that "alpha" is a deliberate answer to
 * "which releases is this installation willing to see", rather than whatever
 * happens to be newest.
 */
export const CHANNELS = ["alpha"];

/** An archive larger than this is refused before a byte is written. */
export const MAX_PACKAGE_BYTES = 400 * 1024 * 1024;

/**
 * The public half of the Hallvi alpha release key, as raw Ed25519 bytes.
 * Its private half lives outside this repository and outside every
 * installation; `docs/releases.md` says where the maintainer keeps it.
 */
const ALPHA_RELEASE_KEY = "zAij7gWKCYN0dTMzbMURpCh/pxVoqPglUHgzIXtEsJE=";

/** SPKI wrapper for a raw Ed25519 public key, so `createPublicKey` takes it. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyFrom(rawBase64) {
  const raw = Buffer.from(rawBase64, "base64");
  if (raw.length !== 32) throw new Error("A release key is 32 bytes.");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * The keys this installation trusts.
 *
 * Normally exactly one: the key written above. `HALLVI_RELEASE_KEY` replaces
 * it — it never adds an alternative and there is no way to turn verification
 * off — so that a test installation can be offered test releases. An
 * installation running on somebody else's key says so wherever it offers an
 * update, because that is not the same promise.
 */
export function trustedKeys(env = process.env) {
  const chosen = env.HALLVI_RELEASE_KEY?.trim();
  return {
    own: !chosen,
    keys: [publicKeyFrom(chosen || ALPHA_RELEASE_KEY)],
  };
}

/** The platform this machine installs, or null when nothing is built for it. */
export function currentPlatform(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  return null;
}

/** A release is untrustworthy for a reason the owner should be able to read. */
export class ReleaseRefusal extends Error {}

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.tgz$/;

function want(condition, reason) {
  if (!condition) throw new ReleaseRefusal(reason);
}

/**
 * Reads a manifest's bytes, having first established that this key signed
 * exactly these bytes. Order matters: nothing in the document is read as a
 * fact, not even to report it, before the signature is checked.
 *
 * `channel` is what the caller asked for. A manifest that names a different
 * one is refused rather than quietly accepted, so that a signed release
 * intended for another channel cannot be served as this one's answer.
 */
export function verifyManifest({ bytes, signature, channel, keys }) {
  want(
    Buffer.isBuffer(bytes) && bytes.length > 0,
    "The release manifest is empty.",
  );
  want(bytes.length <= 64 * 1024, "The release manifest is implausibly large.");
  let raw;
  try {
    raw = Buffer.from(String(signature).trim(), "base64");
  } catch {
    raw = Buffer.alloc(0);
  }
  want(
    raw.length === 64,
    "The release manifest's signature is not a signature.",
  );
  want(
    keys.some((key) => verify(null, bytes, key, raw)),
    "The release manifest is not signed by the key this Hallvi trusts. Nothing was downloaded.",
  );

  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ReleaseRefusal("The release manifest is not readable JSON.");
  }
  want(
    value?.hallviRelease === 1,
    "This release manifest is a format Hallvi does not know.",
  );
  want(
    CHANNELS.includes(value.channel),
    `Unknown release channel: ${value.channel}`,
  );
  want(
    value.channel === channel,
    `This is a ${value.channel} release and this Hallvi follows ${channel}.`,
  );
  want(
    VERSION.test(value.version ?? ""),
    "The release manifest has no usable version.",
  );
  want(
    HEX_40.test(value.revision ?? ""),
    "The release manifest has no source revision.",
  );
  want(
    Number.isInteger(value.schemaVersion) && value.schemaVersion > 0,
    "The release manifest does not say which database schema it needs.",
  );
  // Which schemas this release can take records from. A release that says
  // nothing can take only its own, which is what every release before this
  // field meant.
  const migratesFrom = value.migratesFrom ?? [];
  want(
    Array.isArray(migratesFrom) &&
      migratesFrom.every(
        (from) =>
          Number.isInteger(from) && from > 0 && from < value.schemaVersion,
      ),
    "The release manifest lists schemas it cannot have migrated from.",
  );
  want(
    typeof value.notes === "string" && value.notes.startsWith("https://"),
    "The release manifest has no release-notes address.",
  );
  want(
    typeof value.releasedAt === "string" &&
      !Number.isNaN(Date.parse(value.releasedAt)),
    "The release manifest has no release date.",
  );
  const packages = {};
  for (const [platform, entry] of Object.entries(value.packages ?? {})) {
    want(
      PLATFORMS.includes(platform),
      `The release names an unsupported platform: ${platform}`,
    );
    want(
      FILE_NAME.test(entry?.file ?? ""),
      `The ${platform} package has no usable file name.`,
    );
    want(
      typeof entry.url === "string" && entry.url.startsWith("https://"),
      `The ${platform} package is not offered over HTTPS.`,
    );
    want(
      Number.isInteger(entry.size) &&
        entry.size > 0 &&
        entry.size <= MAX_PACKAGE_BYTES,
      `The ${platform} package states an implausible size.`,
    );
    want(
      HEX_64.test(entry.sha256 ?? ""),
      `The ${platform} package has no usable checksum.`,
    );
    packages[platform] = {
      file: entry.file,
      url: entry.url,
      size: entry.size,
      sha256: entry.sha256,
    };
  }
  want(Object.keys(packages).length > 0, "The release offers no packages.");
  return {
    channel: value.channel,
    version: value.version,
    revision: value.revision,
    schemaVersion: value.schemaVersion,
    migratesFrom: [...migratesFrom],
    releasedAt: value.releasedAt,
    notes: value.notes,
    packages,
  };
}
