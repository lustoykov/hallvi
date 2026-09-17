import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
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
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import * as store from "../../../src/server/db";
import {
  captureControllerPayload,
  controllerProtectionFacts,
  controllerProtectionState,
  copyDue,
  decryptArchive,
  encryptArchive,
  protectController,
  recoveryKit,
  confirmRecoveryKit,
  openControllerCopy,
  type DestinationAccess,
} from "../../../src/server/controller-protection";
import * as secrets from "../../../src/server/application-secrets";
import { readTar } from "../../../src/server/tar";
import { pushTestDatabase } from "../../test-database";

let root: string;
let access: DestinationAccess;
let storage: Server;
const objects = new Map<string, Buffer>();
const requests: Array<{ method: string; path: string; auth: string }> = [];

function entries(archive: Buffer) {
  return new Map(
    readTar(archive)
      .filter((entry) => entry.type === "file")
      .map((entry) => [entry.path, entry.content]),
  );
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "hd-controller-protection-"));
  vi.stubEnv("HALDUR_DB_PATH", join(root, "state", "haldur.db"));
  vi.stubEnv("HALDUR_CONFIG_DIR", join(root, "state"));
  vi.stubEnv("HALDUR_PI_CONFIG_DIR", join(root, "state"));
  mkdirSync(join(root, "state"), { recursive: true });
  pushTestDatabase(join(root, "state", "haldur.db"));
  // A stand-in for the owner's bucket: it records what was signed and keeps
  // the bytes, so a copy can be opened again the way recovery would.
  storage = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk as Buffer));
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        path: request.url ?? "",
        auth: request.headers.authorization ?? "",
      });
      if (request.method === "PUT")
        objects.set(request.url ?? "", Buffer.concat(chunks));
      if (request.method === "DELETE") objects.delete(request.url ?? "");
      response.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) =>
    storage.listen(0, "127.0.0.1", () => resolve()),
  );
  const port = (storage.address() as { port: number }).port;
  access = {
    endpoint: `http://127.0.0.1:${port}`,
    region: "auto",
    bucket: "controller-copies",
    accessKeyId: "AKIAQAQAQAQAQAQAQAQA",
    secretAccessKey: "0123456789012345678901234567890123456789",
  };
});

afterAll(() => {
  store.db().$client.close();
  storage.close();
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

beforeEach(() => {
  objects.clear();
  requests.length = 0;
  // A case that leaves a response mid-flight must not make every later copy
  // a skip.
  store.db().$client.exec("UPDATE messages SET status = 'completed'");
  rmSync(join(root, "state", "controller-protection"), {
    recursive: true,
    force: true,
  });
});

function application() {
  const app = store.insertApplication({
    name: "Notes",
    repositoryUrl: "https://github.com/owner/notes",
    repositoryOwner: "owner",
    repositoryName: "notes",
  });
  const chat = store.insertChat(app.id, "Main");
  return { app, chat };
}

it("copies the controller while it runs, including committed WAL data", async () => {
  const { chat } = application();
  store.insertMessage(chat.id, "user", "Deploy it", "user");
  mkdirSync(join(root, "state", "backup-destinations"), { recursive: true });
  writeFileSync(
    join(root, "state", "backup-destinations", "default.json"),
    JSON.stringify({ bucket: "controller-copies" }),
  );
  const { entries: files, capturedAt } = await captureControllerPayload();
  const names = files.map((file) => file.path);
  expect(names).toContain("payload/database/haldur.db");
  expect(names).toContain("payload/database/RECOVERY_QUARANTINE");
  expect(names).toContain("payload/config/RECOVERY_QUARANTINE");
  expect(names).toContain("payload/config/backup-destinations/default.json");
  expect(names).toContain("payload/manifest.json");
  // One file, once: the account directory is usually the config directory.
  expect(new Set(names).size).toBe(names.length);
  expect(Date.parse(capturedAt)).toBeGreaterThan(0);
  // The message was committed through WAL and never checkpointed; the online
  // backup has to carry it, or the copy is a copy of yesterday.
  const copy = join(root, "captured.db");
  writeFileSync(
    copy,
    files.find((file) => file.path === "payload/database/haldur.db")!.content,
  );
  const captured = new Database(copy, { readonly: true });
  expect(captured.prepare("SELECT count(*) AS c FROM messages").get()).toEqual({
    c: 1,
  });
  captured.close();
});

it("opens again only with the recovery passphrase", async () => {
  const { entries: files } = await captureControllerPayload();
  const { writeTar } = await import("../../../src/server/tar");
  const archive = writeTar(files);
  const sealed = encryptArchive(archive, "PASSPHRASE-FOR-THE-TEST-0123456789");
  expect(sealed.subarray(0, 7).toString()).toBe("SGCTRL1");
  expect(sealed.includes(archive.subarray(0, 64))).toBe(false);
  expect(
    decryptArchive(sealed, "PASSPHRASE-FOR-THE-TEST-0123456789").equals(
      archive,
    ),
  ).toBe(true);
  expect(() => decryptArchive(sealed, "WRONG-PASSPHRASE-0123456789")).toThrow(
    /passphrase/i,
  );
});

it("uploads a copy the owner can open, and offers the kit once", async () => {
  const copy = await protectController("daily", { access });
  expect(copy?.outcome).toBe("succeeded");
  expect(copy?.objectKey).toMatch(
    /^controller\/\d{8}T\d{6}Z-[0-9a-f]{8}\.tar\.enc$/,
  );
  expect(requests[0].method).toBe("PUT");
  expect(requests[0].auth).toMatch(
    /^AWS4-HMAC-SHA256 Credential=AKIAQAQAQAQAQAQAQAQA\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
  );
  const stored = objects.get(`/controller-copies/${copy!.objectKey}`)!;
  expect(stored.length).toBe(copy!.bytes);
  const kit = recoveryKit()!;
  const opened = entries(decryptArchive(stored, kit.passphrase));
  expect(opened.has("payload/database/haldur.db")).toBe(true);
  const manifest = JSON.parse(
    opened.get("payload/manifest.json")!.toString("utf8"),
  );
  expect(manifest.format).toBe(1);
  expect(manifest.hot).toBe(true);
  // Recovery has to install the code that matches these records.
  expect(manifest.sourceRevision).toMatch(/^[0-9a-f]{40}$/);
  expect(typeof manifest.sourceDirty).toBe("boolean");
  // The passphrase must not be inside the thing it opens.
  for (const [, content] of opened)
    expect(content.includes(kit.passphrase)).toBe(false);
  expect(controllerProtectionFacts().state).toBe("copied");
  expect(controllerProtectionFacts().kitConfirmedAt).toBeNull();
  confirmRecoveryKit();
  expect(controllerProtectionFacts().state).toBe("recoverable");
  expect(controllerProtectionFacts().kitConfirmedAt).not.toBeNull();
});

it("skips a copy while a change is running and says so", async () => {
  const { chat } = application();
  const message = store.insertMessage(
    chat.id,
    "assistant",
    "Working",
    "pi",
    "running",
  );
  const skipped = await protectController("after-change", { access });
  expect(skipped?.outcome).toBe("skipped");
  expect(skipped?.reason).toMatch(/change was running/i);
  expect(requests).toEqual([]);
  // A stale running row must not make the worker record a skip every minute
  // until the copies the record should hold are pushed out of it.
  const at = Date.parse(skipped!.finishedAt!);
  expect(copyDue("after-change", at + 60_000)).toBe(false);
  expect(copyDue("after-change", at + 3_600_000)).toBe(true);
  store
    .db()
    .$client.exec(
      `UPDATE messages SET status = 'completed' WHERE id = '${message.id}'`,
    );
  const taken = await protectController("after-change", { access });
  expect(taken?.outcome).toBe("succeeded");
  expect(objects.size).toBe(1);
});

it("keeps the last fourteen copies and deletes the rest", async () => {
  for (let index = 0; index < 16; index++)
    expect((await protectController("daily", { access }))?.outcome).toBe(
      "succeeded",
    );
  expect(objects.size).toBe(14);
  expect(
    requests.filter((request) => request.method === "DELETE"),
  ).toHaveLength(2);
  const state = controllerProtectionState();
  const live = state.copies.filter(
    (item) => item.outcome === "succeeded" && !item.expiredAt,
  );
  expect(live).toHaveLength(14);
  for (const item of live)
    expect(objects.has(`/controller-copies/${item.objectKey}`)).toBe(true);
});

it("waits an hour after an upload that produced no copy", async () => {
  const broken = { ...access, endpoint: "http://127.0.0.1:1" };
  const failed = await protectController("daily", { access: broken });
  expect(failed?.outcome).toBe("failed");
  const at = Date.parse(failed!.finishedAt!);
  // Without this the first rejected upload is captured, encrypted and
  // re-attempted every minute the worker is idle.
  expect(copyDue("daily", at + 60_000)).toBe(false);
  expect(copyDue("after-change", at + 60_000)).toBe(false);
  expect(copyDue("daily", at + 3_600_000)).toBe(true);
});

it("records a failure without claiming protection", async () => {
  const broken = { ...access, endpoint: "http://127.0.0.1:1" };
  const copy = await protectController("daily", { access: broken });
  expect(copy?.outcome).toBe("failed");
  expect(copy?.reason).toBeTruthy();
  const facts = controllerProtectionFacts();
  expect(facts.state).toBe("failing");
  expect(facts.lastCopyAt).toBeNull();
});

it("opens a copy again through the recovery command, and refuses a damaged one", async () => {
  const { chat } = application();
  store.insertMessage(chat.id, "user", "Something worth keeping", "user");
  const copy = await protectController("daily", { access });
  expect(copy?.outcome).toBe("succeeded");
  const stored = objects.get(`/controller-copies/${copy!.objectKey}`)!;
  const archive = join(root, "downloaded.tar.enc");
  writeFileSync(archive, stored);
  const target = join(root, `restore-${randomUUID()}`);
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/controller-backups/decrypt-copy.mjs",
      "--archive",
      archive,
      "--target",
      target,
      "--passphrase",
      recoveryKit()!.passphrase,
    ],
    { encoding: "utf8", cwd: process.cwd() },
  );
  const result = JSON.parse(output);
  expect(result.quarantined).toBe(true);
  expect(existsSync(join(target, "RECOVERY_QUARANTINE"))).toBe(true);
  expect(existsSync(join(target, "payload/database/RECOVERY_QUARANTINE"))).toBe(
    true,
  );
  // The restored database is the controller's own, openable and complete.
  const restored = new Database(join(target, "payload/database/haldur.db"), {
    readonly: true,
  });
  expect(restored.prepare("PRAGMA integrity_check").get()).toEqual({
    integrity_check: "ok",
  });
  expect(
    restored
      .prepare("SELECT count(*) AS c FROM messages WHERE body = ?")
      .get("Something worth keeping"),
  ).toEqual({ c: 1 });
  restored.close();
  // One flipped bit is a damaged copy, not a partial recovery.
  const damaged = Buffer.from(stored);
  damaged[damaged.length - 1] ^= 1;
  expect(() =>
    openControllerCopy(damaged, recoveryKit()!.passphrase),
  ).toThrow();
});

it("carries the application secret store, and the values resolve after restore", async () => {
  // The gap this closes was invisible from the outside: the archive opened,
  // every digest matched, and the recovered controller could not authenticate
  // to a single database it had deployed. A copy that restores the
  // deployments and not the passwords is not a recovery copy.
  const { app } = application();
  const generatedName = "POSTGRES_PASSWORD";
  const suppliedName = "GF_SECURITY_ADMIN_PASSWORD";
  secrets.generateSecret(app.id, {
    name: generatedName,
    why: "PostgreSQL role password.",
    process: "db",
  });
  secrets.requestSecret(app.id, {
    name: suppliedName,
    why: "Grafana admin.",
    process: "grafana",
  });
  const supplied = "the-owner-typed-this-one";
  secrets.establishSecret(app.id, suppliedName, supplied);
  const generated = secrets.revealSecret(app.id, generatedName).value;

  const copy = await protectController("daily", { access });
  expect(copy?.outcome).toBe("succeeded");
  const stored = objects.get(`/controller-copies/${copy!.objectKey}`)!;
  const archive = join(root, "secrets-copy.tar.enc");
  writeFileSync(archive, stored);
  const target = join(root, `restore-secrets-${randomUUID()}`);
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/controller-backups/decrypt-copy.mjs",
      "--archive",
      archive,
      "--target",
      target,
      "--passphrase",
      recoveryKit()!.passphrase,
    ],
    { encoding: "utf8", cwd: process.cwd() },
  );

  // The sealed store and the key that opens it, restored to the isolated
  // config directory and nowhere else.
  const restoredConfig = join(target, "payload", "config");
  expect(existsSync(join(restoredConfig, "secrets", "key"))).toBe(true);
  expect(existsSync(join(restoredConfig, "secrets", `${app.id}.json`))).toBe(
    true,
  );
  // Still sealed: the archive's own encryption is not what protects these.
  const sealedFile = readFileSync(
    join(restoredConfig, "secrets", `${app.id}.json`),
    "utf8",
  );
  expect(sealedFile).not.toContain(supplied);
  expect(sealedFile).not.toContain(generated);

  // A controller reading only the restored directory resolves both values.
  // Compared, never printed: the assertion is that they match, and a failure
  // message must not become the place a password appears.
  vi.stubEnv("HALDUR_CONFIG_DIR", restoredConfig);
  try {
    const environment = secrets.secretEnvironment(app.id, [
      generatedName,
      suppliedName,
    ]);
    const value = (name: string) => {
      const row = environment
        .split("\n")
        .find((line) => line.startsWith(`export ${name}=`))!;
      return row.slice(`export ${name}='`.length, -1);
    };
    expect(secrets.sameSecret(value(generatedName), generated)).toBe(true);
    expect(secrets.sameSecret(value(suppliedName), supplied)).toBe(true);
    // And the provenance survives, so the restored controller still refuses
    // to read the owner's own value back to the screen.
    const rows = secrets.listSecrets(app.id);
    expect(rows.find((row) => row.name === suppliedName)?.origin).toBe("owner");
    expect(() => secrets.revealSecret(app.id, suppliedName)).toThrow();
    expect(
      secrets.sameSecret(
        secrets.revealSecret(app.id, generatedName).value,
        generated,
      ),
    ).toBe(true);
  } finally {
    vi.stubEnv("HALDUR_CONFIG_DIR", join(root, "state"));
  }

  // The passphrase stays outside the thing it opens.
  const opened = openControllerCopy(stored, recoveryKit()!.passphrase);
  expect(
    opened.entries.some((entry) => entry.path.includes("recovery-key.json")),
  ).toBe(false);
});
