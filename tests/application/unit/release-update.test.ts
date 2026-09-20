// What must hold before Hallvi replaces itself.
//
// These protect the ways an update could go wrong where the owner cannot see
// it: a release that was not signed by the key Hallvi ships, bytes that are
// not the ones the signed manifest named, a package built for another machine
// or another database schema, and two updates running at once. The rest of
// updating — the service manager, the installer, the restart — is proved
// against a real installation rather than here.
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  compareVersions,
  discover,
  downloadPackage,
  installation,
  packageFor,
  reopen,
  UNCHANGED,
} from "../../../scripts/release-source.mjs";
import { verifyManifest } from "../../../scripts/release-trust.mjs";
import {
  attemptStatus,
  claimAttempt,
  readAttempt,
  recordPhase,
  UpdateInProgressError,
} from "../../../scripts/update-attempt.mjs";
import {
  blockedReason,
  checkForReleaseIfDue,
} from "../../../scripts/update-start.mjs";

/** A release key that is not Hallvi's, standing in for Hallvi's. */
function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ type: "spki", format: "der" }))
    .subarray(-32)
    .toString("base64");
  return { privateKey, raw, public: publicKeyFrom(raw) };
}

/** The raw base64 key, as HALLVI_RELEASE_KEY carries it. */
function keyOf(key: ReturnType<typeof keypair>) {
  return key.raw;
}

/** The SPKI form `verifyManifest` takes, from a raw Ed25519 public key. */
function publicKeyFrom(raw: string) {
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(raw, "base64"),
    ]),
    format: "der",
    type: "spki",
  });
}

const ARCHIVE = Buffer.from(
  "a hallvi platform archive, for the purposes of this test",
);
const ARCHIVE_SHA256 =
  "7f39dbcb4d949c71f84ffd5b31bdd9718bc45cc25b73f3d340497196a85c2bfd";

const MAC_PACKAGE = {
  file: "hallvi-0.1.0-alpha.2-darwin-arm64.tgz",
  url: "https://github.com/lustoykov/hallvi/releases/download/v0.1.0-alpha.2/hallvi-0.1.0-alpha.2-darwin-arm64.tgz",
  size: 100_000_000,
  sha256: "b".repeat(64),
};

function manifestFor(overrides: Record<string, unknown> = {}) {
  return {
    hallviRelease: 1,
    channel: "alpha",
    version: "0.1.0-alpha.2",
    revision: "a".repeat(40),
    schemaVersion: 15,
    releasedAt: "2026-09-20T09:00:00.000Z",
    notes: "https://github.com/lustoykov/hallvi/releases/tag/v0.1.0-alpha.2",
    packages: { "darwin-arm64": MAC_PACKAGE },
    ...overrides,
  };
}

function signedBy(key: ReturnType<typeof keypair>, value: unknown) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  return {
    bytes,
    signature: sign(null, bytes, key.privateKey).toString("base64"),
  };
}

/** A manifest as `verifyManifest` returns it, for the checks that follow it. */
function verified(value: Record<string, unknown>) {
  const key = keypair();
  return verifyManifest({
    ...signedBy(key, value),
    channel: "alpha",
    keys: [key.public],
  });
}

function programWith(program: string, name: string, value: unknown) {
  mkdirSync(join(program, "dist"), { recursive: true });
  writeFileSync(join(program, "dist", name), JSON.stringify(value));
  return program;
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-update-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("accepts a manifest this key signed, and refuses one it did not", () => {
  const key = keypair();
  const stranger = keypair();
  const { bytes, signature } = signedBy(key, manifestFor());

  expect(
    verifyManifest({ bytes, signature, channel: "alpha", keys: [key.public] }),
  ).toMatchObject({ version: "0.1.0-alpha.2", revision: "a".repeat(40) });

  // The same bytes, a key that did not sign them.
  expect(() =>
    verifyManifest({
      bytes,
      signature,
      channel: "alpha",
      keys: [stranger.public],
    }),
  ).toThrow(/not signed by the key this Hallvi trusts/);

  // The same key, bytes that changed after it signed. One digit is enough: a
  // manifest that names a different archive is a different manifest.
  const tampered = Buffer.from(
    bytes.toString("utf8").replace('"size": 100000000', '"size": 100000001'),
  );
  expect(() =>
    verifyManifest({
      bytes: tampered,
      signature,
      channel: "alpha",
      keys: [key.public],
    }),
  ).toThrow(/not signed by the key this Hallvi trusts/);

  expect(() =>
    verifyManifest({
      bytes,
      signature: "not a signature at all",
      channel: "alpha",
      keys: [key.public],
    }),
  ).toThrow(/not a signature/);
});

it("refuses a signed manifest for another channel, or one naming nothing usable", () => {
  const key = keypair();
  const keys = [key.public];
  expect(() =>
    verifyManifest({
      ...signedBy(key, manifestFor({ channel: "beta" })),
      channel: "alpha",
      keys,
    }),
  ).toThrow(/Unknown release channel/);

  const cases: [Record<string, unknown>, RegExp][] = [
    [{ packages: { windows: MAC_PACKAGE } }, /unsupported platform/],
    [{ revision: "not-a-commit" }, /no source revision/],
    [{ notes: "http://example.test/notes" }, /no release-notes address/],
    [{ schemaVersion: "fifteen" }, /which database schema/],
    [
      {
        packages: {
          "darwin-arm64": { ...MAC_PACKAGE, url: "http://x.test/a.tgz" },
        },
      },
      /not offered over HTTPS/,
    ],
    [
      { packages: { "darwin-arm64": { ...MAC_PACKAGE, size: 9_000_000_000 } } },
      /implausible size/,
    ],
    [
      { packages: { "darwin-arm64": { ...MAC_PACKAGE, sha256: "short" } } },
      /no usable checksum/,
    ],
  ];
  for (const [broken, complaint] of cases)
    expect(() =>
      verifyManifest({
        ...signedBy(key, manifestFor(broken)),
        channel: "alpha",
        keys,
      }),
    ).toThrow(complaint);
});

it("finds the newest published release, skipping drafts and anything signed by another key", async () => {
  const key = keypair();
  const stranger = keypair();
  const good = signedBy(key, manifestFor());
  const forged = signedBy(stranger, manifestFor({ version: "9.9.9" }));
  const served = new Map<string, Buffer>([
    ["https://releases.test/9/hallvi-release.json", forged.bytes],
    [
      "https://releases.test/9/hallvi-release.json.sig",
      Buffer.from(forged.signature),
    ],
    ["https://releases.test/2/hallvi-release.json", good.bytes],
    [
      "https://releases.test/2/hallvi-release.json.sig",
      Buffer.from(good.signature),
    ],
  ]);
  const serving = (releases: unknown[]) =>
    ((url: string) =>
      Promise.resolve(
        url === "https://releases.test/index"
          ? new Response(JSON.stringify(releases))
          : served.has(url)
            ? new Response(new Uint8Array(served.get(url)!))
            : new Response("no", { status: 404 }),
      )) as unknown as typeof fetch;
  const assets = (at: string) => [
    {
      name: "hallvi-release.json",
      browser_download_url: `${at}/hallvi-release.json`,
    },
    {
      name: "hallvi-release.json.sig",
      browser_download_url: `${at}/hallvi-release.json.sig`,
    },
  ];
  const env = { HALLVI_RELEASE_KEY: key.raw } as unknown as NodeJS.ProcessEnv;

  // A draft is not a release; the first published one is the candidate.
  const found = await discover({
    source: "https://releases.test/index",
    env,
    fetch: serving([
      {
        draft: true,
        tag_name: "v9.9.9",
        assets: assets("https://releases.test/9"),
      },
      {
        draft: false,
        tag_name: "v0.1.0-alpha.2",
        assets: assets("https://releases.test/2"),
      },
    ]),
  });
  expect(found).toMatchObject({ tag: "v0.1.0-alpha.2", ownKey: false });
  expect(found?.manifest.version).toBe("0.1.0-alpha.2");
  // The candidate carries its own bytes, so whoever installs checks them again
  // rather than trusting what discovery said about them.
  expect(
    reopen({
      document: found!.document,
      signature: found!.signature,
      channel: "alpha",
      env,
    }).revision,
  ).toBe("a".repeat(40));

  // Published, newer, signed by somebody else: refused, not ranked.
  await expect(
    discover({
      source: "https://releases.test/index",
      env,
      fetch: serving([
        {
          draft: false,
          tag_name: "v9.9.9",
          assets: assets("https://releases.test/9"),
        },
      ]),
    }),
  ).rejects.toThrow(/not signed by the key this Hallvi trusts/);
});

it("stops reading an oversized release list without a Content-Length", async () => {
  let sent = 0;
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent++;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
  });
  await expect(
    discover({
      source: "https://releases.test/index",
      fetch: async () => new Response(oversized),
    }),
  ).rejects.toThrow("The release list is larger than Hallvi will read.");
  expect(sent).toBeLessThan(10);
});

it("orders releases the way their numbers read", () => {
  expect(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.1")).toBe(1);
  expect(compareVersions("0.1.0-alpha.10", "0.1.0-alpha.9")).toBe(1);
  expect(compareVersions("0.1.0", "0.1.0-alpha.9")).toBe(1);
  expect(compareVersions("0.1.0-alpha.1", "0.1.0-alpha.1")).toBe(0);
  expect(compareVersions("0.1.0-alpha.1", "0.2.0-alpha.1")).toBe(-1);
});

it("refuses a release with no package for this machine", () => {
  const manifest = verified(manifestFor());
  expect(() => packageFor(manifest, "linux-x64")).toThrow(
    /no package for linux-x64/,
  );
  expect(packageFor(manifest, "darwin-arm64")).toMatchObject({
    platform: "darwin-arm64",
    sha256: MAC_PACKAGE.sha256,
  });
});

it("throws away a download whose bytes are not the ones the manifest named", async () => {
  const file = join(root, "package.tgz");
  const entry = {
    file: "hallvi.tgz",
    url: "https://releases.test/hallvi.tgz",
    size: ARCHIVE.length,
    sha256: ARCHIVE_SHA256,
  };
  const serve = (body: Buffer) =>
    (() =>
      Promise.resolve(
        new Response(new Uint8Array(body)),
      )) as unknown as typeof fetch;

  await expect(
    downloadPackage({ ...entry, sha256: "c".repeat(64) }, file, {
      fetch: serve(ARCHIVE),
    }),
  ).rejects.toThrow(/does not match the checksum in the signed manifest/);
  expect(existsSync(file)).toBe(false);

  // More bytes than the manifest allows: stopped while reading, not after.
  await expect(
    downloadPackage(entry, file, {
      fetch: serve(Buffer.concat([ARCHIVE, Buffer.from("and more")])),
    }),
  ).rejects.toThrow(/larger than the manifest says/);
  expect(existsSync(file)).toBe(false);

  const kept = await downloadPackage(entry, file, { fetch: serve(ARCHIVE) });
  expect(kept.sha256).toBe(ARCHIVE_SHA256);
  expect(readFileSync(file)).toEqual(ARCHIVE);
});

it("blocks a release whose schema nothing can reach, before anything is downloaded", () => {
  const program = programWith(join(root, "app"), "schema-version.json", {
    version: 15,
  });
  // A release that does not say it can take schema 15 is a refusal.
  expect(
    blockedReason(program, {
      manifest: verified(manifestFor({ schemaVersion: 16 })),
    }),
  ).toMatch(/schema 16 and this one uses schema 15/);
  expect(
    blockedReason(program, {
      manifest: verified(manifestFor({ schemaVersion: 16 })),
    }),
  ).toMatch(/does not say it can migrate them/);
  // A release that says it takes schema 15 is not refused for its schema,
  // whatever this older program's own list happens to contain.
  const carried = blockedReason(program, {
    manifest: verified(manifestFor({ schemaVersion: 18, migratesFrom: [15] })),
  });
  // Whatever it says, it is no longer about the schema: on this machine
  // nothing is in the way, and on another only the missing package is.
  expect(carried ?? "").not.toMatch(/schema/);

  // The same schema on the machine the package is built for: nothing in the
  // way. A Linux machine is told about the package, not about the schema.
  const reason = blockedReason(program, { manifest: verified(manifestFor()) });
  expect(reason).toBe(
    process.platform === "darwin" && process.arch === "arm64"
      ? null
      : "Release 0.1.0-alpha.2 has no package for linux-x64.",
  );
});

it("takes the release's word for what it can migrate, not its own list", () => {
  // The scenario this exists for. The installed program is schema 18 and its
  // own list knows only 15 to 18, because the 18-to-19 migration is written
  // in the release that introduces 19. If eligibility came from the reader,
  // every forward migration would be refused by the only program in a
  // position to ask for it.
  const program = programWith(join(root, "at18"), "schema-version.json", {
    version: 18,
  });
  const offered = blockedReason(program, {
    manifest: verified(
      manifestFor({ schemaVersion: 19, migratesFrom: [18], version: "0.2.0" }),
    ),
  });
  expect(offered ?? "").not.toMatch(/schema/);

  // The same release saying nothing about schema 18 is refused.
  expect(
    blockedReason(program, {
      manifest: verified(
        manifestFor({
          schemaVersion: 19,
          migratesFrom: [15],
          version: "0.2.0",
        }),
      ),
    }),
  ).toMatch(/does not say it can migrate them/);

  // And a release from before the field existed can take only its own.
  expect(
    blockedReason(program, {
      manifest: verified(manifestFor({ schemaVersion: 19, version: "0.2.0" })),
    }),
  ).toMatch(/does not say it can migrate them/);
});

it("refuses a release claiming to migrate from a schema newer than its own", () => {
  expect(() =>
    verified(manifestFor({ schemaVersion: 18, migratesFrom: [19] })),
  ).toThrow(/lists schemas it cannot have migrated from/);
  expect(() =>
    verified(manifestFor({ schemaVersion: 18, migratesFrom: ["15"] })),
  ).toThrow(/lists schemas it cannot have migrated from/);
});

it("says what a development checkout is, and never offers to replace it", () => {
  const home = join(root, "home");
  const installed = join(home, ".local", "lib", "hallvi", "app");
  expect(installation(join(root, "checkout"), home)).toMatchObject({
    kind: "development",
    reason: expect.stringContaining("not from an installation"),
  });
  // In the right place, but with nothing saying which release it is.
  expect(installation(installed, home)).toMatchObject({
    kind: "development",
    reason: expect.stringContaining("no release record"),
  });
  programWith(installed, "release.json", {
    version: "0.1.0",
    revision: "uncommitted",
    platform: "darwin-arm64",
  });
  expect(installation(installed, home)).toMatchObject({
    kind: "development",
    reason: expect.stringContaining("uncommitted"),
  });
  programWith(installed, "release.json", {
    version: "0.1.0",
    revision: "a".repeat(40),
    platform: "darwin-arm64",
  });
  expect(installation(installed, home)).toMatchObject({ kind: "installed" });
});

it("lets one update run, and reports one whose helper died as the failure it is", () => {
  const attempt = {
    id: "one",
    from: { version: "0.1.0-alpha.1", revision: "a".repeat(40) },
    to: { version: "0.1.0-alpha.2", revision: "b".repeat(40) },
    candidate: { document: "", signature: "", channel: "alpha" },
    helper: {
      kind: "systemd" as const,
      name: "hallvi-update-one",
      log: "/dev/null",
    },
  };
  let running = true;
  const alive = () => running;

  claimAttempt(root, alive, attempt);
  // The helper has not started yet; a second caller must still see the slot.
  running = false;
  expect(attemptStatus(root, alive)).toMatchObject({
    phase: "checking",
    running: true,
  });
  expect(() => claimAttempt(root, alive, { ...attempt, id: "two" })).toThrow(
    UpdateInProgressError,
  );
  running = true;
  recordPhase(root, "downloading", "Downloading Hallvi 0.1.0-alpha.2.");
  // A second attempt while the first one holds the slot changes nothing.
  expect(() => claimAttempt(root, alive, { ...attempt, id: "two" })).toThrow(
    UpdateInProgressError,
  );
  expect(readAttempt(root)).toMatchObject({ id: "one", phase: "downloading" });

  // The helper's service is gone and the phase never reached an end. That is
  // a failed update, said so, rather than a download that runs for ever.
  running = false;
  expect(attemptStatus(root, alive)).toMatchObject({
    phase: "failed",
    running: false,
    message: expect.stringContaining("stopped without finishing"),
  });
  expect(() =>
    claimAttempt(root, alive, { ...attempt, id: "two" }),
  ).not.toThrow();
});

it("looks hourly, only in an installation, and only when a look is due", async () => {
  // A checkout has nothing to update. Every worktree polling GitHub every
  // hour is the failure this gate exists to prevent.
  const checkout = programWith(join(root, "checkout"), "release.json", {
    version: "0.1.0",
    revision: "a".repeat(40),
    platform: "darwin-arm64",
  });
  const data = join(root, "data");
  mkdirSync(data, { recursive: true });
  expect(await checkForReleaseIfDue({ program: checkout, data })).toBeNull();
  expect(existsSync(join(data, "update-check.json"))).toBe(false);

  // An installation, with an answer from four minutes ago: nothing is due.
  const home = join(root, "home");
  const installed = programWith(
    join(home, ".local", "lib", "hallvi", "app"),
    "release.json",
    { version: "0.1.0", revision: "b".repeat(40), platform: "darwin-arm64" },
  );
  const fresh = {
    checkedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    candidate: { tag: "v0.1.0-alpha.1" },
    error: null,
  };
  writeFileSync(join(data, "update-check.json"), `${JSON.stringify(fresh)}\n`);
  // Four minutes into the hour: the cached answer is handed back untouched,
  // and nothing reaches the network.
  expect(
    await checkForReleaseIfDue({ program: installed, data, home }),
  ).toMatchObject({ checkedAt: fresh.checkedAt, candidate: fresh.candidate });

  // Ninety minutes in, it is due. With no reachable source it records the
  // reason and keeps the answer it had, rather than replacing it with
  // nothing.
  writeFileSync(
    join(data, "update-check.json"),
    `${JSON.stringify({ ...fresh, checkedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() })}\n`,
  );
  const looked = await checkForReleaseIfDue({
    program: installed,
    data,
    home,
    env: { HALLVI_RELEASE_SOURCE: "https://127.0.0.1:1/releases" },
  });
  expect(looked?.checkedAt).not.toBe(fresh.checkedAt);
  expect(looked?.error).toEqual(expect.any(String));
  expect(looked?.candidate).toEqual(fresh.candidate);
});

it("does not fetch a release it has already verified", async () => {
  const key = keypair();
  const manifest = manifestFor();
  const { bytes, signature } = signedBy(key, manifest);
  const asked: string[] = [];
  const listing = JSON.stringify([
    {
      tag_name: "v0.1.0-alpha.2",
      draft: false,
      assets: [
        {
          name: "hallvi-release.json",
          browser_download_url: "https://example.com/hallvi-release.json",
        },
        {
          name: "hallvi-release.json.sig",
          browser_download_url: "https://example.com/hallvi-release.json.sig",
        },
      ],
    },
  ]);
  const get = async (url: string) => {
    asked.push(String(url));
    const body = String(url).endsWith(".sig")
      ? signature
      : String(url).endsWith("hallvi-release.json")
        ? bytes.toString("utf8")
        : listing;
    return new Response(body, { status: 200 });
  };

  // Told nothing, it fetches the listing and both assets and verifies them.
  const found = await discover({
    source: "https://example.com/releases",
    env: { HALLVI_RELEASE_KEY: keyOf(key) },
    fetch: get as unknown as typeof fetch,
  });
  expect(found).not.toBe(UNCHANGED);
  expect(asked).toHaveLength(3);

  // Told the tag it already has, it reads the listing and stops there.
  asked.length = 0;
  const again = await discover({
    source: "https://example.com/releases",
    env: { HALLVI_RELEASE_KEY: keyOf(key) },
    known: "v0.1.0-alpha.2",
    fetch: get as unknown as typeof fetch,
  });
  expect(again).toBe(UNCHANGED);
  expect(asked).toEqual(["https://example.com/releases"]);
});
