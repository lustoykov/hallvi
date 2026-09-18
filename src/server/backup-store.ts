// Where a copy lands when the destination is this computer.
//
// The Backups page can tell four kinds of destination apart, and until now the
// product could only reach one of them: a file written beside the application
// on its own server, which dies with the server. The cheapest destination that
// actually survives losing the application host is the machine running Server
// Guy — it is already there, it already holds the SSH credential that reaches
// the host, and it costs nothing.
//
// It is not the best destination and the page says so: it depends on this
// machine existing and being reachable, which object storage does not. It is
// the one that can be made to work today without asking the owner for another
// provider credential, and one destination that genuinely works is worth more
// than four that are drawn in the UI.
//
// The controller pulls, rather than the host pushing. The host has no
// credential for this machine and should not be given one: a compromised
// application server that can write into the controller's backup directory is
// a compromised controller. `scp` over the connection the controller already
// owns keeps the direction of trust the right way round.

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import { operatorSettings } from "./operator-execution";
import { piConfigDir } from "./pi-configuration";
import { managedSshOptions } from "./managed-ssh";

const exec = promisify(execFile);

/** Nothing bigger is pulled without the owner having chosen to. */
const MOST_BYTES = 512 * 1024 * 1024;

const optionsSchema = z.object({
  /** An absolute path on the application server. */
  remotePath: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => path.startsWith("/"), "Give an absolute path."),
  /** What this copy is of, for the record Pi writes afterwards. */
  covers: z.string().min(1).max(200),
});

function directory(applicationId: string) {
  const path = join(piConfigDir(), "backups", z.uuid().parse(applicationId));
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

/**
 * Pulls one file from the application server onto this computer.
 *
 * Returns what it is rather than what was asked for: the size and digest are
 * measured on the copy that arrived, so a record written from this cannot
 * claim a copy that is not there. A truncated transfer shows up as a different
 * digest from the host's, and the caller is given both.
 */
export async function fetchBackupCopy(
  applicationId: string,
  input: z.input<typeof optionsSchema>,
) {
  const { remotePath, covers } = optionsSchema.parse(input);
  const host = operatorSettings(applicationId).host;
  if (!host)
    throw new Error("Connect a server before copying anything off it.");

  const connection = [...managedSshOptions(host), "-o", "ConnectTimeout=15"];

  // Ask the host what it thinks the file is, before pulling it. A digest from
  // the far side is the only way to tell a complete copy from a truncated one.
  const { stdout: described } = await exec(
    "ssh",
    [
      ...connection,
      `${host.user}@${host.address}`,
      // Both values from one round trip, in a form that cannot be confused
      // with a path containing spaces.
      `set -eu; stat -c %s ${shellQuote(remotePath)}; sha256sum ${shellQuote(remotePath)} | cut -d' ' -f1`,
    ],
    { timeout: 120_000, maxBuffer: 1024 * 1024 },
  );
  const [sizeText, remoteDigest] = described.trim().split("\n");
  const remoteBytes = Number(sizeText);
  if (!Number.isFinite(remoteBytes))
    throw new Error(`${remotePath} is not a readable file on the server.`);
  if (remoteBytes > MOST_BYTES)
    throw new Error(
      `${remotePath} is ${(remoteBytes / 1024 / 1024).toFixed(0)} MB, and ` +
        `this destination takes files up to ${MOST_BYTES / 1024 / 1024} MB. ` +
        `A copy this size wants object storage rather than this computer.`,
    );

  const into = directory(applicationId);
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${remotePath.split("/").at(-1)}`;
  const local = join(into, name);
  // `ssh … cat`, not `scp`. One transport rather than two: the same options,
  // the same pinned host key and the same credential the controller already
  // uses for everything else, so there is one thing to get right instead of
  // two that can disagree. It is also the difference between working and not
  // on any setup where `ssh` is reached differently from `scp` — the rig is
  // exactly that, and a real host is no worse off.
  await new Promise<void>((resolve, reject) => {
    const sink = openSync(local, "w", 0o600);
    const pull = spawn(
      "ssh",
      [
        ...connection,
        `${host.user}@${host.address}`,
        `cat ${shellQuote(remotePath)}`,
      ],
      { stdio: ["ignore", sink, "pipe"] },
    );
    let complaint = "";
    pull.stderr?.on("data", (chunk) => (complaint += chunk));
    pull.on("error", (problem) => {
      closeSync(sink);
      reject(problem);
    });
    pull.on("close", (code) => {
      closeSync(sink);
      if (code === 0) return resolve();
      // A partial file is worse than none: it would look like a backup.
      try {
        unlinkSync(local);
      } catch {
        // Nothing was written.
      }
      reject(
        new Error(
          `Copying ${remotePath} off the server failed (exit ${code}). ` +
            `Nothing was kept. ${complaint.slice(0, 300)}`,
        ),
      );
    });
  });

  const { readFileSync } = await import("node:fs");
  const bytes = statSync(local).size;
  const digest = createHash("sha256").update(readFileSync(local)).digest("hex");
  if (digest !== remoteDigest) {
    unlinkSync(local);
    throw new Error(
      `The copy that arrived does not match the file on the server ` +
        `(${bytes} bytes here, ${remoteBytes} there). Nothing was kept, so ` +
        `there is no half-copy to mistake for a backup.`,
    );
  }
  return {
    path: local,
    bytes,
    digest,
    covers,
    // The words a record should use, so the page can classify it without
    // reading prose.
    destination: `${name} on the computer running Hallvi`,
    destinationKind: "controller" as const,
    caveat:
      "This survives losing the application's server and depends on this computer. It is not object storage.",
  };
}

/** What is already here, so a plan can retire what it no longer needs. */
export function listBackupCopies(applicationId: string) {
  const into = directory(applicationId);
  return readdirSync(into)
    .map((name) => {
      const path = join(into, name);
      const stat = statSync(path);
      return { name, path, bytes: stat.size, at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Removes the oldest copies beyond the number to keep.
 *
 * Retention is the part of a backup plan that quietly stops working, so it is
 * the controller's job rather than a cron line on a host: this runs where the
 * files are and reports exactly what it removed.
 */
export function pruneBackupCopies(applicationId: string, keep: number) {
  if (!Number.isInteger(keep) || keep < 1)
    throw new Error("Keep at least one copy.");
  const held = listBackupCopies(applicationId);
  const removed: string[] = [];
  for (const item of held.slice(keep)) {
    unlinkSync(item.path);
    removed.push(item.name);
  }
  return { kept: Math.min(keep, held.length), removed };
}

/** `it's` → `'it'\''s'`, so a path reaches the far shell as one word. */
function shellQuote(value: string) {
  return `'${value.split("'").join(`'\\''`)}'`;
}
