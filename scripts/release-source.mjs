// Where releases come from, and which one an installation is looking at.
//
// Discovery answers with one candidate: a signed manifest, read from the
// release that published it. Everything an installation does afterwards —
// what it shows, what it downloads, what it checks — comes from that one
// document. Nothing later asks a server for "latest" again, so the release
// somebody chose is the release that gets installed.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  currentPlatform,
  MAX_PACKAGE_BYTES,
  ReleaseRefusal,
  trustedKeys,
  verifyManifest,
} from "./release-trust.mjs";

/** The releases of the repository Hallvi is published from. */
export const DEFAULT_RELEASE_SOURCE =
  "https://api.github.com/repos/lustoykov/hallvi/releases?per_page=20";

/** The one channel this version follows. */
export const DEFAULT_CHANNEL = "alpha";

const MANIFEST = "hallvi-release.json";
const SIGNATURE = "hallvi-release.json.sig";

/**
 * What is installed here, as the package recorded it when it was built.
 * Absent from a development checkout, which has no release to describe.
 */
export function installedRelease(program) {
  const file = join(program, "dist", "release.json");
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return typeof value?.version === "string" &&
      typeof value?.revision === "string"
      ? {
          version: value.version,
          revision: value.revision,
          platform: value.platform ?? null,
          nodeVersion: value.nodeVersion ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether this release says it can take records in `schema`. The answer is
 * the release's, not the reader's: a migration is written in the version that
 * introduces the new schema, so an installation old enough to need one cannot
 * have heard of it. `install.sh` checks the claim again from the unpacked
 * archive, against the real database, before anything is replaced.
 */
export function migrates(manifest, schema) {
  return (manifest.migratesFrom ?? []).includes(schema);
}

/** The schema version the program in `program` was built against. */
export function programSchemaVersion(program) {
  try {
    return JSON.parse(
      readFileSync(join(program, "dist", "schema-version.json"), "utf8"),
    ).version;
  } catch {
    return null;
  }
}

/**
 * Whether this program is an installation that may replace itself.
 *
 * A checkout is not. It has no release to compare against, its source is the
 * working tree rather than a revision somebody published, and replacing it
 * with an installed release would throw away the work in it. So it says what
 * it is and offers nothing.
 */
export function installation(program, home = homedir()) {
  const expected = join(home, ".local", "lib", "hallvi", "app");
  const release = installedRelease(program);
  if (program !== expected)
    return {
      kind: "development",
      program,
      reason: "This Hallvi runs from a checkout, not from an installation.",
    };
  if (!release)
    return {
      kind: "development",
      program,
      reason:
        "This program has no release record, so it did not come from a package.",
    };
  if (!/^[0-9a-f]{40}$/.test(release.revision))
    return {
      kind: "development",
      program,
      release,
      reason: `This package was built from ${release.revision} source rather than from a commit.`,
    };
  return { kind: "installed", program, release };
}

/**
 * Compares two release versions the way their numbers read. A prerelease
 * sorts before the version it leads to, and `alpha.2` after `alpha.1`.
 */
export function compareVersions(left, right) {
  const parts = (value) => {
    const [core, pre = ""] = String(value).split("-", 2);
    return {
      numbers: core.split(".").map((piece) => Number(piece) || 0),
      pre: pre ? pre.split(".") : null,
    };
  };
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < 3; index++) {
    const difference = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0);
    if (difference) return difference < 0 ? -1 : 1;
  }
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    const one = a.pre[index];
    const other = b.pre[index];
    if (one === other) continue;
    if (one === undefined) return -1;
    if (other === undefined) return 1;
    const numeric = /^\d+$/.test(one) && /^\d+$/.test(other);
    const difference = numeric
      ? Number(one) - Number(other)
      : one < other
        ? -1
        : 1;
    if (difference) return difference < 0 ? -1 : 1;
  }
  return 0;
}

async function readBounded(response, limit, what) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit)
    throw new ReleaseRefusal(`${what} is larger than Hallvi will read.`);
  if (!response.body) throw new ReleaseRefusal(`${what} has no body.`);
  const chunks = [];
  let read = 0;
  for await (const chunk of response.body) {
    read += chunk.byteLength;
    if (read > limit) {
      throw new ReleaseRefusal(`${what} is larger than Hallvi will read.`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, read);
}

async function fetchOk(url, fetching, accept) {
  const response = await fetching(url, {
    headers: {
      "User-Agent": "Hallvi",
      ...(accept ? { Accept: accept } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new ReleaseRefusal(
      `The release source answered ${response.status} for ${new URL(url).pathname}.`,
    );
  return response;
}

/**
 * The newest release on this channel, as a manifest this installation has
 * verified, together with the release it came from. Returns null when the
 * channel has published nothing Hallvi can read.
 *
 * Drafts are not releases: GitHub does not serve them to a reader without a
 * token, and a draft is by definition something the maintainer has not
 * decided to publish. A prerelease is, which is what this channel is for.
 */
/**
 * The newest release this installation would accept, or nothing.
 *
 * `known` is the tag a previous look already verified. An hourly check that
 * finds the same release again has nothing to learn from downloading and
 * re-verifying the same two assets, so it says so and stops there; the caller
 * keeps what it had. Anything else — a new tag, or no cached tag — is fetched
 * and verified in full.
 */
export async function discover({
  channel = DEFAULT_CHANNEL,
  source,
  env = process.env,
  known = null,
  fetch: get = fetch,
} = {}) {
  // From the environment handed in, the same one the key comes from. Reading
  // the key from `env` and the source from `process.env` would make a caller
  // that supplies both get one of them.
  source ??= env.HALLVI_RELEASE_SOURCE?.trim() || DEFAULT_RELEASE_SOURCE;
  const trust = trustedKeys(env);
  const listing = await fetchOk(source, get, "application/vnd.github+json");
  const listed = JSON.parse(
    (await readBounded(listing, 2 * 1024 * 1024, "The release list")).toString(
      "utf8",
    ),
  );
  if (!Array.isArray(listed))
    throw new ReleaseRefusal(
      "The release source did not answer with a list of releases.",
    );
  for (const release of listed) {
    if (release?.draft) continue;
    const assets = new Map(
      (release.assets ?? []).map((asset) => [
        asset.name,
        asset.browser_download_url,
      ]),
    );
    if (!assets.has(MANIFEST) || !assets.has(SIGNATURE)) continue;
    // The same release as last time: nothing to fetch, nothing to verify
    // again, and the listing already told us it is still the newest.
    if (known && release.tag_name === known) return UNCHANGED;
    const [bytes, signature] = await Promise.all([
      fetchOk(assets.get(MANIFEST), get).then((response) =>
        readBounded(response, 64 * 1024, "The release manifest"),
      ),
      fetchOk(assets.get(SIGNATURE), get).then((response) =>
        readBounded(response, 4 * 1024, "The release signature"),
      ),
    ]);
    const manifest = verifyManifest({
      bytes,
      signature: signature.toString("utf8"),
      channel,
      keys: trust.keys,
    });
    return {
      manifest,
      /** Kept whole, so whoever installs verifies the same bytes again. */
      document: bytes.toString("base64"),
      signature: signature.toString("utf8").trim(),
      tag: release.tag_name ?? null,
      ownKey: trust.own,
    };
  }
  return null;
}

/** `discover` found the release the caller already knew about. */
export const UNCHANGED = Symbol.for("hallvi.release.unchanged");

/** Re-reads a candidate kept on disk, checking its signature all over again. */
export function reopen({
  document,
  signature,
  channel = DEFAULT_CHANNEL,
  env = process.env,
}) {
  return verifyManifest({
    bytes: Buffer.from(document, "base64"),
    signature,
    channel,
    keys: trustedKeys(env).keys,
  });
}

/**
 * The package a manifest offers this machine, or why it offers none. The
 * platform is decided here rather than taken from anything downloaded.
 */
export function packageFor(manifest, platform = currentPlatform()) {
  if (!platform)
    throw new ReleaseRefusal(
      "Hallvi has no prebuilt release for this operating system and processor.",
    );
  const found = manifest.packages[platform];
  if (!found)
    throw new ReleaseRefusal(
      `Release ${manifest.version} has no package for ${platform}.`,
    );
  return { platform, ...found };
}

/**
 * Downloads one package to `file`, refusing anything that is not the exact
 * bytes the manifest named: not longer, and not a different hash. The size
 * limit is applied while reading, so an endless answer stops early rather
 * than filling the disk.
 */
export async function downloadPackage(
  entry,
  file,
  { fetch: get = fetch, onProgress } = {},
) {
  const response = await get(entry.url, {
    headers: { "User-Agent": "Hallvi" },
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60_000),
  });
  if (!response.ok || !response.body)
    throw new ReleaseRefusal(
      `The release package answered ${response.status}.`,
    );
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > entry.size)
    throw new ReleaseRefusal(
      "The release package is larger than the manifest says.",
    );
  const digest = createHash("sha256");
  let read = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      async function* (source) {
        for await (const chunk of source) {
          read += chunk.length;
          if (read > entry.size)
            throw new ReleaseRefusal(
              "The release package is larger than the manifest says.",
            );
          digest.update(chunk);
          onProgress?.(read, entry.size);
          yield chunk;
        }
      },
      createWriteStream(file),
    );
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  if (read !== entry.size) {
    await rm(file, { force: true });
    throw new ReleaseRefusal(
      "The release package is not the size the manifest says.",
    );
  }
  const sha256 = digest.digest("hex");
  if (sha256 !== entry.sha256) {
    await rm(file, { force: true });
    throw new ReleaseRefusal(
      "The downloaded package does not match the checksum in the signed manifest. Nothing was installed.",
    );
  }
  return { file, bytes: read, sha256 };
}

export { currentPlatform, MAX_PACKAGE_BYTES, ReleaseRefusal };
