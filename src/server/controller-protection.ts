import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

import type { ControllerProtectionFacts } from "./application-facts";
import { backupDestinationAccess } from "./backup-connection";
import { databasePath } from "./db";
import { piAccountDir, piConfigDir } from "./pi-configuration";
import { readTar, writeTar } from "./tar";

/**
 * Server Guy's own records and keys, copied to the destination the owner
 * already connected. This is a worker job, not a conversation: Pi may read
 * the result and talk about it, and never runs it.
 *
 * The archive holds every credential the controller has, including the key
 * to the bucket it sits in, so it is encrypted with a passphrase that must
 * live outside this machine. That is the one thing the owner has to do, and
 * `kit.confirmedAt` records that they did it.
 */

const PREFIX = "controller/";
/** Two weeks of copies. Not configurable: nobody wants that decision. */
const KEEP = 14;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MARKER = "RECOVERY_QUARANTINE";
const MAGIC = Buffer.from("SGCTRL1\n", "utf8");
const timestamp = z.iso.datetime({ offset: true });

const copySchema = z.object({
  id: z.uuid(),
  trigger: z.enum(["after-change", "daily"]),
  startedAt: timestamp,
  /** The recovery point: when the copy of the records was taken. */
  capturedAt: timestamp.nullable().default(null),
  finishedAt: timestamp.nullable().default(null),
  outcome: z.enum(["succeeded", "failed", "skipped"]),
  /** Why it was skipped or how it failed, in the owner's words. */
  reason: z.string().max(200).nullable().default(null),
  bytes: z.number().int().nonnegative().nullable().default(null),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
  objectKey: z.string().max(200).nullable().default(null),
  expiredAt: timestamp.nullable().default(null),
  retention: z
    .object({ deleted: z.number().int().nonnegative(), failed: z.boolean() })
    .default({ deleted: 0, failed: false }),
});
export type ControllerCopy = z.infer<typeof copySchema>;

const stateSchema = z.object({
  version: z.literal(1),
  kit: z
    .object({
      createdAt: timestamp,
      bucket: z.string().max(63),
      endpoint: z.string().max(300),
      prefix: z.string().max(60),
      /** When the owner said they had saved the kit somewhere else. */
      confirmedAt: timestamp.nullable().default(null),
    })
    .nullable()
    .default(null),
  copies: z.array(copySchema).max(30),
});
export type ControllerProtectionState = z.infer<typeof stateSchema>;

const keySchema = z.object({
  version: z.literal(1),
  passphrase: z.string().min(32).max(128),
  createdAt: timestamp,
});

function protectionDir() {
  const directory = join(piConfigDir(), "controller-protection");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function writePrivate(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

function readPrivate(path: string): unknown {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Controller protection state must be a private file.");
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const EMPTY: ControllerProtectionState = { version: 1, kit: null, copies: [] };

export function controllerProtectionState(): ControllerProtectionState {
  const value = readPrivate(join(protectionDir(), "state.json"));
  if (value === undefined) return EMPTY;
  const result = stateSchema.safeParse(value);
  // An unreadable record is not evidence of a copy. Say nothing rather than
  // claim protection from a file this version cannot understand.
  return result.success ? result.data : EMPTY;
}

function saveState(state: ControllerProtectionState) {
  writePrivate(join(protectionDir(), "state.json"), state);
}

/** The passphrase, generated once and kept for the worker to reuse. */
function passphrase() {
  const path = join(protectionDir(), "recovery-key.json");
  const existing = readPrivate(path);
  if (existing !== undefined) return keySchema.parse(existing).passphrase;
  // Base32-ish groups: readable aloud, typed once into a password manager.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(30);
  const value = [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("")
    .replace(/(.{5})(?=.)/g, "$1-");
  writePrivate(path, {
    version: 1,
    passphrase: value,
    createdAt: new Date().toISOString(),
  });
  return value;
}

// Capture

function walk(directory: string, prefix: string, entries: TarFile[]) {
  for (const name of readdirSync(directory).sort()) {
    if (name === ".locks") continue;
    const source = join(directory, name);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink())
      throw new Error("Refusing a symbolic link in controller state.");
    if (stat.isDirectory()) walk(source, `${prefix}/${name}`, entries);
    else if (stat.isFile())
      entries.push({
        path: `${prefix}/${name}`,
        content: readFileSync(source),
        mode: 0o600,
      });
  }
}

/**
 * Which revision of Server Guy this copy came from, so recovery can install
 * the code that matches its records. A controller running from something
 * other than a checkout says so rather than guessing.
 */
function sourceRevision() {
  try {
    const git = (args: string[]) =>
      execFileSync("git", ["-C", process.cwd(), ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    // An installed copy unpacked inside some other repository is not a
    // checkout of this one, and must not borrow that repository's revision.
    if (
      realpathSync(git(["rev-parse", "--show-toplevel"])) !==
      realpathSync(process.cwd())
    )
      throw new Error("not a checkout");
    return {
      sourceRevision: git(["rev-parse", "HEAD"]),
      sourceDirty: Boolean(git(["status", "--porcelain"])),
    };
  } catch {
    // An installation is not a checkout; its package names what built it.
    try {
      const release = JSON.parse(
        readFileSync(join(process.cwd(), "dist", "release.json"), "utf8"),
      ) as { revision?: string };
      if (release.revision && release.revision !== "unknown")
        return { sourceRevision: release.revision, sourceDirty: false };
    } catch {}
    return { sourceRevision: null, sourceDirty: null };
  }
}

interface TarFile {
  path: string;
  content: Buffer;
  mode: number;
}

/**
 * A copy of the controller taken while it runs: the SQLite online-backup API
 * includes committed WAL data, and every other file is read as it stands.
 * The layout matches the stopped-controller checkpoint, so the same restore
 * verification and quarantine markers apply.
 */
export async function captureControllerPayload(): Promise<{
  entries: TarFile[];
  capturedAt: string;
}> {
  const entries: TarFile[] = [];
  const database = databasePath();
  const staging = mkdtempSync(join(tmpdir(), "sg-controller-copy-"));
  try {
    const target = join(staging, "server-guy.db");
    const reader = new Database(database, { readonly: true });
    try {
      await reader.backup(target);
    } finally {
      reader.close();
    }
    const copy = new Database(target);
    try {
      copy.pragma("journal_mode = DELETE");
    } finally {
      copy.close();
    }
    entries.push({
      path: "payload/database/server-guy.db",
      content: readFileSync(target),
      mode: 0o600,
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const capturedAt = new Date().toISOString();
  const sessions = join(dirname(database), "pi-sessions");
  if (existsSync(sessions))
    walk(sessions, "payload/database/pi-sessions", entries);
  const config = piConfigDir();
  for (const name of readdirSync(config).sort())
    if (name.endsWith(".json") && lstatSync(join(config, name)).isFile())
      entries.push({
        path: `payload/config/${name}`,
        content: readFileSync(join(config, name)),
        mode: 0o600,
      });
  // Named rather than swept: a copy of every directory beside the database
  // would eventually take one nobody meant to send off the machine. Each of
  // these is here because recovery cannot proceed without it.
  //
  // `secrets` holds the application credentials and the key that opens them.
  // It was missing, and its absence was invisible: the archive opened, every
  // digest matched, and the recovered controller could not authenticate to a
  // single database it had deployed. A copy that restores everything except
  // the passwords is not a recovery copy.
  for (const name of [
    "deployments",
    "backup-schedules",
    "backup-destinations",
    "secrets",
  ])
    if (existsSync(join(config, name)))
      walk(join(config, name), `payload/config/${name}`, entries);
  // The copy history travels with the copy; the passphrase never does.
  const state = join(protectionDir(), "state.json");
  if (existsSync(state))
    entries.push({
      path: "payload/config/controller-protection-state.json",
      content: readFileSync(state),
      mode: 0o600,
    });
  const dependencies: string[] = [];
  const settingsPath = join(piAccountDir(), "pi-settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      providerId?: string;
      authPath?: string;
    };
    // The account directory is usually the config directory, whose *.json
    // sweep has already taken this file. Do not put it in twice.
    if (settingsPath !== join(config, "pi-settings.json"))
      entries.push({
        path: "payload/config/pi-settings.json",
        content: readFileSync(settingsPath),
        mode: 0o600,
      });
    const auth = settings.authPath ?? "";
    if (auth && existsSync(auth) && !lstatSync(auth).isSymbolicLink()) {
      const credential = (
        JSON.parse(readFileSync(auth, "utf8")) as Record<string, unknown>
      )[settings.providerId ?? ""];
      if (credential === undefined)
        dependencies.push(
          "The selected model credential was missing; reconnect after recovery.",
        );
      else {
        entries.push({
          path: "payload/config/recovery-provider-auth.json",
          content: Buffer.from(
            `${JSON.stringify({ [settings.providerId ?? ""]: credential }, null, 2)}\n`,
          ),
          mode: 0o600,
        });
        dependencies.push(
          "Point pi-settings.json at recovery-provider-auth.json, or reconnect the model account.",
        );
      }
    } else
      dependencies.push(
        "The model credential file was not readable; reconnect after recovery.",
      );
  }
  // A checkout keeps its settings beside the code; an installation keeps
  // them beside its database, in the file `scripts/serve.mjs` loads.
  for (const [name, path] of [
    [".env", join(process.cwd(), ".env")],
    [".env.local", join(process.cwd(), ".env.local")],
    ["server-guy.env", join(dirname(database), "server-guy.env")],
  ])
    if (existsSync(path))
      entries.push({
        path: `payload/environment/${name}.disabled`,
        content: readFileSync(path),
        mode: 0o600,
      });
  for (const directory of ["database", "config"])
    entries.push({
      path: `payload/${directory}/${MARKER}`,
      content: Buffer.from(
        "Recovery copy: review paths, credentials and queued work before activation.\n",
      ),
      mode: 0o600,
    });
  const manifest = {
    format: 1,
    capturedAt,
    hot: true,
    ...sourceRevision(),
    sourcePaths: { config, database, project: process.cwd() },
    recoveryDependencies: dependencies,
    files: Object.fromEntries(
      entries.map((entry) => [
        entry.path.replace(/^payload\//, ""),
        createHash("sha256").update(entry.content).digest("hex"),
      ]),
    ),
  };
  entries.push({
    path: "payload/manifest.json",
    content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    mode: 0o600,
  });
  return { entries, capturedAt };
}

// Encryption

function derive(secret: string, salt: Buffer) {
  return scryptSync(secret, salt, 32);
}

export function encryptArchive(archive: Buffer, secret: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(secret, salt), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptArchive(encrypted: Buffer, secret: string) {
  if (!encrypted.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error("This file is not a Server Guy controller copy.");
  let offset = MAGIC.length;
  const salt = encrypted.subarray(offset, (offset += 16));
  const iv = encrypted.subarray(offset, (offset += 12));
  const tag = encrypted.subarray(offset, (offset += 16));
  const decipher = createDecipheriv("aes-256-gcm", derive(secret, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(encrypted.subarray(offset)),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "The recovery passphrase does not open this copy, or the copy is damaged.",
    );
  }
}

/**
 * Opens a copy the way recovery does: decrypt, then prove the archive is the
 * one that was captured before anything is written to disk. The payload keeps
 * the stopped-controller checkpoint's layout, so the quarantine markers and
 * the activation boundary in scripts/controller-backups/README.md apply
 * unchanged.
 */
export function openControllerCopy(encrypted: Buffer, secret: string) {
  const entries = readTar(decryptArchive(encrypted, secret)).filter(
    (entry) => entry.type === "file",
  );
  const found = new Map(entries.map((entry) => [entry.path, entry.content]));
  const manifestFile = found.get("payload/manifest.json");
  if (!manifestFile) throw new Error("This copy has no manifest.");
  const manifest = JSON.parse(manifestFile.toString("utf8")) as {
    format: number;
    capturedAt: string;
    files: Record<string, string>;
    recoveryDependencies: string[];
  };
  if (manifest.format !== 1)
    throw new Error("This copy uses a format this version cannot read.");
  const listed = Object.keys(manifest.files).sort();
  const actual = [...found.keys()]
    .filter((path) => path !== "payload/manifest.json")
    .map((path) => path.replace(/^payload\//, ""))
    .sort();
  if (listed.join("\n") !== actual.join("\n"))
    throw new Error("This copy holds different files than it recorded.");
  for (const [name, expected] of Object.entries(manifest.files))
    if (
      createHash("sha256")
        .update(found.get(`payload/${name}`)!)
        .digest("hex") !== expected
    )
      throw new Error(`A file in this copy does not match its record: ${name}`);
  for (const directory of ["database", "config"])
    if (!found.has(`payload/${directory}/${MARKER}`))
      throw new Error("This copy is missing its recovery quarantine marker.");
  return { manifest, entries };
}

// Storage

export interface DestinationAccess {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function hash(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}
function hmac(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

/** One signed S3 request. No SDK: a PUT and a DELETE are this much code. */
async function signedRequest(
  access: DestinationAccess,
  method: "PUT" | "DELETE",
  key: string,
  body: Buffer,
) {
  const url = new URL(
    `${access.endpoint.replace(/\/$/, "")}/${access.bucket}/${key}`,
  );
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const payloadHash = hash(body);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonical = [
    method,
    url.pathname,
    "",
    ...Object.keys(headers)
      .sort()
      .map((name) => `${name}:${headers[name]}`),
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${access.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, hash(canonical)].join("\n");
  let signing: Buffer = Buffer.from(`AWS4${access.secretAccessKey}`, "utf8");
  for (const part of [date, access.region, "s3", "aws4_request"])
    signing = hmac(signing, part);
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${access.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signing, toSign).toString("hex")}`;
  const response = await fetch(url, {
    method,
    headers,
    body: method === "PUT" ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(600_000),
  });
  await response.arrayBuffer();
  // Provider bodies can name buckets and keys; the status is enough to act on.
  if (!response.ok)
    throw new Error(
      `The backup storage refused the request (${response.status}).`,
    );
}

// The job

function changeRunning() {
  // A response still being written is a change in flight. Read the database
  // directly: this must not depend on the schema assertion or the app's
  // connection, and it must stay true while the worker is between runs.
  const path = databasePath();
  if (!existsSync(path)) return false;
  const reader = new Database(path, { readonly: true });
  try {
    return Boolean(
      reader
        .prepare("SELECT 1 FROM messages WHERE status = 'running' LIMIT 1")
        .get(),
    );
  } catch {
    return false;
  } finally {
    reader.close();
  }
}

function record(state: ControllerProtectionState, copy: ControllerCopy) {
  const copies = [copy, ...state.copies].slice(0, 30);
  saveState({ ...state, copies });
  return copy;
}

/**
 * Deletes everything past the newest `KEEP` successful copies. Retention
 * failing does not make the copy that just succeeded a failure.
 */
async function applyRetention(
  access: DestinationAccess,
  copies: ControllerCopy[],
) {
  const live = copies.filter(
    (copy) => copy.outcome === "succeeded" && copy.objectKey && !copy.expiredAt,
  );
  const expiredAt = new Date().toISOString();
  let deleted = 0;
  let failed = false;
  for (const copy of live.slice(KEEP)) {
    try {
      await signedRequest(access, "DELETE", copy.objectKey!, Buffer.alloc(0));
      copy.expiredAt = expiredAt;
      deleted += 1;
    } catch {
      failed = true;
    }
  }
  return { deleted, failed };
}

export async function protectController(
  trigger: ControllerCopy["trigger"],
  options: { access?: DestinationAccess } = {},
): Promise<ControllerCopy | null> {
  const access = options.access ?? backupDestinationAccess();
  // Nothing is connected: the view already says Server Guy is not protected,
  // and a record of "could not" every few minutes would say nothing more.
  if (!access) return null;
  const state = controllerProtectionState();
  const startedAt = new Date().toISOString();
  const base = {
    id: randomUUID(),
    trigger,
    startedAt,
    capturedAt: null,
    finishedAt: null,
    reason: null,
    bytes: null,
    sha256: null,
    objectKey: null,
    expiredAt: null,
    retention: { deleted: 0, failed: false },
  } satisfies Omit<ControllerCopy, "outcome">;
  if (changeRunning())
    return record(state, {
      ...base,
      outcome: "skipped",
      finishedAt: new Date().toISOString(),
      reason: "A change was running. The next copy follows within the hour.",
    });
  try {
    const { entries, capturedAt } = await captureControllerPayload();
    const encrypted = encryptArchive(writeTar(entries), passphrase());
    const objectKey = `${PREFIX}${capturedAt.replace(/[-:]|\.\d{3}/g, "")}-${base.id.slice(0, 8)}.tar.enc`;
    await signedRequest(access, "PUT", objectKey, encrypted);
    const kit = controllerProtectionState().kit ?? {
      createdAt: new Date().toISOString(),
      bucket: access.bucket,
      endpoint: access.endpoint,
      prefix: PREFIX,
      confirmedAt: null,
    };
    const copies = [
      {
        ...base,
        outcome: "succeeded" as const,
        capturedAt,
        finishedAt: new Date().toISOString(),
        bytes: encrypted.length,
        sha256: hash(encrypted),
        objectKey,
      },
      ...state.copies,
    ];
    const retention = await applyRetention(access, copies);
    copies[0].retention = retention;
    saveState({ version: 1, kit, copies: copies.slice(0, 30) });
    return copies[0];
  } catch (error) {
    return record(state, {
      ...base,
      outcome: "failed",
      finishedAt: new Date().toISOString(),
      reason:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "The copy did not finish.",
    });
  }
}

/**
 * Whether a copy is owed. Work finishing earns one at most hourly, so a busy
 * afternoon cannot push a fortnight of copies out of retention; a quiet day
 * still gets its own; and an attempt that produced nothing waits an hour
 * rather than retrying every time the worker looks.
 */
export function copyDue(trigger: ControllerCopy["trigger"], now = Date.now()) {
  const copies = controllerProtectionState().copies;
  const newest = copies[0];
  // An attempt that did not produce a copy waits an hour before the next
  // one. Without this, a destination that refuses the very first upload is
  // captured, encrypted and re-attempted every minute, and the record fills
  // with identical failures until the copies it should hold are gone.
  if (newest && newest.outcome !== "succeeded")
    return now - Date.parse(newest.finishedAt ?? newest.startedAt) >= HOUR_MS;
  const last = copies.find((copy) => copy.outcome === "succeeded");
  if (!last?.finishedAt) return true;
  return (
    now - Date.parse(last.finishedAt) >=
    (trigger === "after-change" ? HOUR_MS : DAY_MS)
  );
}

// What the owner sees

export function recoveryKit() {
  const state = controllerProtectionState();
  if (!state.kit) return null;
  return { ...state.kit, passphrase: passphrase(), keep: KEEP };
}

export function confirmRecoveryKit() {
  const state = controllerProtectionState();
  if (!state.kit) throw new Error("There is no recovery kit to confirm yet.");
  if (!state.kit.confirmedAt)
    saveState({
      ...state,
      kit: { ...state.kit, confirmedAt: new Date().toISOString() },
    });
  return controllerProtectionFacts();
}

function size(bytes: number | null) {
  if (bytes === null) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${mb.toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Server Guy's own protection, as the Backups view states it. */
export function controllerProtectionFacts(): ControllerProtectionFacts {
  const destination = backupDestinationAccess();
  const state = controllerProtectionState();
  const succeeded = state.copies.find((copy) => copy.outcome === "succeeded");
  const newest = state.copies[0] ?? null;
  const lastCopyAt = succeeded?.finishedAt ?? null;
  return {
    connected: Boolean(destination),
    // What the copies say, not what the connection says: copies already in
    // storage survive a destination the owner later disconnects.
    state:
      newest?.outcome === "failed"
        ? "failing"
        : !succeeded
          ? "unprotected"
          : state.kit?.confirmedAt
            ? "recoverable"
            : "copied",
    bucket: destination?.bucket ?? state.kit?.bucket ?? null,
    host: destination
      ? new URL(destination.endpoint).hostname
      : state.kit
        ? new URL(state.kit.endpoint).hostname
        : null,
    keep: KEEP,
    lastCopyAt,
    nextCopyBy: lastCopyAt
      ? new Date(Date.parse(lastCopyAt) + DAY_MS).toISOString()
      : null,
    kitConfirmedAt: state.kit?.confirmedAt ?? null,
    kitReady: Boolean(state.kit),
    copies: state.copies.slice(0, 8).map((copy) => ({
      id: copy.id,
      at: copy.finishedAt ?? copy.startedAt,
      outcome: copy.outcome,
      reason: copy.reason,
      size: size(copy.bytes),
    })),
    retentionFailed: Boolean(succeeded?.retention.failed),
  };
}
