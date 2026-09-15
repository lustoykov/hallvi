// An encrypted copy of what this controller would need to be rebuilt.
//
// The problem it solves: the secret store's encryption key sits beside its
// ciphertext, which is right for a local single-operator application and
// useless as a backup. Copying that directory copies the lock and the key
// together, so anywhere the copy lands, the values are readable. A portable
// archive therefore needs its own encryption, with a passphrase that is not
// inside it.
//
// What this is and is not:
//
// - It is **controller state and credentials**: the records database, the
//   sealed secrets and their key, the per-application SSH keys, and the
//   provider and source-host connections. Enough to stand a controller up
//   again and have it still reach the servers it manages with the credentials
//   it generated.
// - It is **not** the applications' own data. Nothing here backs up a
//   database or an uploaded file on a managed server; that is the Backups
//   destination's job and a completely separate question.
// - It is **not** a provider snapshot, and it is not a substitute for one.
//
// Why OpenPGP rather than something of our own: an archive nobody can open
// without Server Guy is not a recovery archive, and the case it exists for is
// "Server Guy is gone". `gpg --symmetric --cipher-algo AES256` writes a
// standard, authenticated OpenPGP message that any OpenPGP implementation on
// any machine can decrypt with the passphrase, years from now, with no code
// from this repository involved. No cryptographic format is invented here and
// none should be.
//
// The passphrase is never stored. Not in the archive, not beside it, not in
// the controller, and not in Pi's context — a recovery secret kept inside the
// thing it unlocks protects nothing, and one kept in the controller is gone
// with the controller.

import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { piConfigDir } from "./pi-configuration";

const exec = promisify(execFile);

/** Bumped when the contents change shape, so an import can refuse politely. */
export const EXPORT_SCHEMA = 1;

/**
 * What goes in, and what is deliberately left out.
 *
 * Each entry is relative to the controller's configuration directory. The
 * list is explicit rather than "everything": a directory copied wholesale
 * grows new contents later, and an archive whose contents nobody enumerated
 * is one nobody can reason about.
 */
const INCLUDED: { path: string; what: string; sensitive: boolean }[] = [
  {
    path: "server-guy.db",
    what: "Applications, conversations, messages and saved records",
    sensitive: false,
  },
  {
    path: "secrets",
    what: "Every credential the owner supplied or the controller generated, sealed, together with the key that seals them",
    sensitive: true,
  },
  {
    path: "operator",
    what: "The per-application SSH keys and pinned host keys used to reach each server",
    sensitive: true,
  },
  {
    path: "hetzner-connection.json",
    what: "The provider API token",
    sensitive: true,
  },
  {
    path: "github-connection.json",
    what: "The source-host connection",
    sensitive: true,
  },
  {
    path: "pi-settings.json",
    what: "Which model the operator uses. Names an auth file that lives outside this directory and is not included",
    sensitive: false,
  },
];

/** Named so the archive can say what it does not cover. */
export const EXCLUDED = [
  "The applications' own data — databases, uploads, volumes. Their backups are a separate destination and a separate question.",
  "Pi's session history and disposable workspaces, which are rebuilt rather than recovered.",
  "Diagnostics and captured command output.",
  "The model provider's auth file, which lives outside the controller's configuration directory.",
];

export interface ExportEntry {
  path: string;
  what: string;
  sensitive: boolean;
  bytes: number;
}

/** What a caller may show before anything is written. */
export function exportContents(): {
  entries: ExportEntry[];
  missing: string[];
} {
  const base = piConfigDir();
  const entries: ExportEntry[] = [];
  const missing: string[] = [];
  for (const item of INCLUDED) {
    const full = join(base, item.path);
    if (!existsSync(full)) {
      missing.push(item.path);
      continue;
    }
    entries.push({ ...item, bytes: sizeOf(full) });
  }
  return { entries, missing };
}

function sizeOf(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const name of readdirSync(path)) total += sizeOf(join(path, name));
  return total;
}

/** Whether the machine can make one at all, said before the owner tries. */
export async function encryptionAvailable() {
  try {
    const { stdout } = await exec("gpg", ["--version"], { timeout: 10_000 });
    return { available: true, version: stdout.split("\n")[0]?.trim() ?? "gpg" };
  } catch {
    return {
      available: false,
      version: null,
      why: "This export is a standard OpenPGP message so that any OpenPGP tool can open it without Server Guy, and making one needs gpg on this computer. Install GnuPG and try again.",
    };
  }
}

/**
 * A passphrase the owner can write down.
 *
 * Six groups of five base32-ish characters from the system random source —
 * about 150 bits, with no ambiguous glyphs, in blocks that can be read aloud
 * and copied by hand without error. Offered rather than imposed: an owner
 * with a password manager should use their own.
 *
 * It is returned once and never stored. The caller shows it, the owner keeps
 * it, and nothing here can answer "what was it" afterwards.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function suggestPassphrase() {
  const bytes = randomBytes(30);
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]);
  return Array.from({ length: 6 }, (_, group) =>
    chars.slice(group * 5, group * 5 + 5).join(""),
  ).join("-");
}

/**
 * Writes the archive, encrypted, and returns where it is and what proves it.
 *
 * `tar` then `gpg`, both reading and writing pipes, so the plaintext archive
 * is never a file on disk to be forgotten about. The passphrase reaches gpg on
 * a file descriptor rather than argv, because a command line is visible to
 * every other process on the machine.
 */
export async function writeRecoveryExport(options: {
  passphrase: string;
  /** Where to put it. The owner's Downloads, usually. */
  directory: string;
}) {
  if (options.passphrase.length < 16)
    throw new Error(
      "Use a recovery passphrase of at least 16 characters. This archive " +
        "holds every credential this controller has, and the only thing " +
        "standing between it and a reader is the passphrase.",
    );
  const ready = await encryptionAvailable();
  if (!ready.available) throw new Error(ready.why!);

  const { entries, missing } = exportContents();
  if (!entries.some((entry) => entry.path === "server-guy.db"))
    throw new Error(
      "This controller has no records database yet, so there is nothing to " +
        "recover. Add an application first.",
    );

  const base = piConfigDir();
  mkdirSync(options.directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(options.directory, `server-guy-recovery-${stamp}.tar.gpg`);

  // A manifest inside the archive, so whoever opens it in a year can see what
  // it is without running anything.
  const manifest = JSON.stringify(
    {
      schema: EXPORT_SCHEMA,
      writtenAt: new Date().toISOString(),
      what: "Server Guy controller state and credentials. Not the applications' own data.",
      includes: entries.map(({ path, what, bytes }) => ({ path, what, bytes })),
      excludes: EXCLUDED,
      encryption: "OpenPGP symmetric, AES-256.",
      // Spelled out inside the archive as well as in the UI: whoever opens
      // this may be doing it years later, on a machine with no Server Guy on
      // it, having forgotten everything except where the file was.
      open: "gpg --decrypt server-guy-recovery-*.tar.gpg | tar -x",
      passphrase:
        "Not in this archive, and not recoverable from it or from the controller.",
    },
    null,
    2,
  );

  // tar → gpg, both as pipes, so the unencrypted archive is never a file on
  // disk to be forgotten about. No shell is involved, so nothing here can be
  // confused by a path with a quote in it, and the passphrase travels on its
  // own file descriptor rather than a command line every process can read.
  const temporary = mkdtemp();
  writeFileSync(join(temporary, "manifest.json"), manifest, { mode: 0o600 });
  try {
    await pipeline(
      temporary,
      base,
      entries.map((entry) => entry.path),
      file,
      options.passphrase,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  const bytes = statSync(file).size;
  return {
    file,
    bytes,
    schema: EXPORT_SCHEMA,
    entries,
    missing,
    // So the owner can tell two archives apart, and check one arrived whole.
    fingerprint: fingerprintOf(file),
    open: "gpg --decrypt <file> | tar -x",
  };
}

/**
 * `tar -cf -` piped into `gpg --symmetric`, with the passphrase on fd 3.
 *
 * Written out rather than shelled out because every alternative involves
 * quoting a path or a secret into a command line, and both are avoidable.
 */
function pipeline(
  temporary: string,
  base: string,
  paths: string[],
  out: string,
  passphrase: string,
) {
  return new Promise<void>((resolve, reject) => {
    const archive = spawn(
      "tar",
      ["-cf", "-", "-C", temporary, "manifest.json", "-C", base, ...paths],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const sink = openSync(out, "w", 0o600);
    const encrypt = spawn(
      "gpg",
      [
        "--batch",
        "--yes",
        "--symmetric",
        "--cipher-algo",
        "AES256",
        "--passphrase-fd",
        "3",
      ],
      // stdin: the tar stream. stdout: straight into the file. fd 3: the
      // passphrase, written and closed immediately.
      { stdio: ["pipe", sink, "pipe", "pipe"] },
    );
    const passphrasePipe = encrypt.stdio[3] as
      import("node:stream").Writable | null;
    if (!passphrasePipe) {
      closeSync(sink);
      return reject(new Error("gpg would not take the passphrase privately."));
    }
    passphrasePipe.end(passphrase + "\n");
    archive.stdout?.pipe(encrypt.stdin!);

    let complaint = "";
    archive.stderr?.on("data", (chunk) => (complaint += chunk));
    encrypt.stderr?.on("data", (chunk) => (complaint += chunk));

    let archiveCode: number | null = null;
    archive.on("close", (code) => {
      archiveCode = code;
    });
    encrypt.on("close", (code) => {
      closeSync(sink);
      if (code === 0 && (archiveCode === 0 || archiveCode === null))
        return resolve();
      reject(
        new Error(
          `The archive could not be written (tar ${archiveCode}, gpg ${code}). ` +
            complaint.slice(0, 400),
        ),
      );
    });
    for (const child of [archive, encrypt])
      child.on("error", (problem) => reject(problem));
  });
}

function mkdtemp() {
  const path = join(piConfigDir(), "recovery-tmp");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

function fingerprintOf(file: string) {
  return createHash("sha256")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 32);
}
